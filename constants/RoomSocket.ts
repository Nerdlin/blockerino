import { Platform } from "react-native";
import type { RealtimeChannel, RealtimeChannelOptions } from "@supabase/supabase-js";
import { supabase } from "./Supabase";
import { isDiscordActivityLocation } from "./DiscordEnvironment";
import { ensureOnlineIdentity } from "./AccountSession";

// Online rooms can run on Supabase Realtime or on the Cloudflare room worker (workers/rooms). The worker speaks a
// small JSON protocol; RoomChannel below wraps it in the subset of the Supabase channel API the game uses, so a
// call site only swaps supabase.channel/removeChannel for realtime.channel/removeChannel.
// The backend comes from app_config "realtime" ({"backend": "supabase" | "cloudflare"}), so it can be switched
// back without a build. See docs/realtime-cloudflare-plan.md.

export type RealtimeBackend = "supabase" | "cloudflare";

const ROOMS_URL = process.env.EXPO_PUBLIC_ROOMS_URL || "wss://rooms.aionerdlin.me";
const OVERRIDE_KEY = "blockerino.realtime";
const CONNECT_TIMEOUT_MS = 10_000;
const ACK_TIMEOUT_MS = 5_000;
const PING_MS = 15_000; // the room drops a socket silent for 45 s
const RETRY_MS = [500, 1000, 2000, 4000, 8000, 8000];

let backend: RealtimeBackend = "supabase";
let loaded: Promise<void> | null = null;

function localOverride(): RealtimeBackend | null {
	if (Platform.OS !== "web" || typeof window === "undefined") return null;
	try {
		const value = window.localStorage.getItem(OVERRIDE_KEY);
		return value === "cloudflare" || value === "supabase" ? value : null;
	} catch {
		return null;
	}
}

/** Reads the backend flag once; rooms opened before it arrives use the previous value. */
export function loadRealtimeBackend(): Promise<void> {
	loaded ||= (async () => {
		const override = localOverride() || (process.env.EXPO_PUBLIC_REALTIME_BACKEND as RealtimeBackend | undefined);
		if (override === "cloudflare" || override === "supabase") {
			backend = override;
			return;
		}
		try {
			const { data } = await supabase.from("app_config").select("value").eq("key", "realtime").maybeSingle();
			const value = (data?.value as { backend?: string } | null)?.backend;
			if (value === "cloudflare" || value === "supabase") backend = value;
		} catch {
			// keep the default
		}
	})();
	return loaded;
}

export function realtimeBackend(): RealtimeBackend {
	return backend;
}

function roomsBase(): string {
	if (Platform.OS === "web" && typeof window !== "undefined") {
		try {
			// Discord Activities may only reach their own origin; the /rooms URL mapping forwards to the worker.
			if (isDiscordActivityLocation(window.location.hostname, window.location.search)) {
				return `${window.location.origin.replace(/^http/, "ws")}/rooms`;
			}
		} catch {
			// fall through
		}
	}
	return ROOMS_URL;
}

type Meta = Record<string, unknown>;
type Listener =
	| { type: "broadcast"; event: string; cb: (message: { type: "broadcast"; event: string; payload: any }) => void }
	| { type: "presence"; event: string; cb: (payload: any) => void };
type Status = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

export class RoomChannel {
	readonly topic: string;
	private listeners: Listener[] = [];
	private ws: WebSocket | null = null;
	private statusCb: ((status: Status, err?: Error) => void) | null = null;
	private presence: Record<string, Meta[]> = {};
	private tracked: { key: string; meta: Meta } | null = null;
	private presenceKey: string;
	private wantAck: boolean;
	private ackId = 0;
	private acks = new Map<number, (result: "ok" | "timed out" | "error") => void>();
	private attempt = 0;
	private closed = false;
	private joined = false;
	private timers = new Set<ReturnType<typeof setTimeout>>();
	private ping: ReturnType<typeof setInterval> | null = null;

	constructor(topic: string, opts?: RealtimeChannelOptions) {
		this.topic = topic;
		this.wantAck = !!opts?.config?.broadcast?.ack;
		this.presenceKey = opts?.config?.presence?.key || `p-${Math.random().toString(36).slice(2, 10)}`;
	}

	on(type: "broadcast" | "presence", filter: { event: string }, cb: (payload: any) => void): this {
		this.listeners.push({ type, event: filter.event, cb } as Listener);
		return this;
	}

	subscribe(cb?: (status: Status, err?: Error) => void): this {
		this.statusCb = cb || null;
		void this.open();
		return this;
	}

	presenceState(): Record<string, Meta[]> {
		const state: Record<string, Meta[]> = { ...this.presence };
		if (this.tracked) state[this.tracked.key] = [...(state[this.tracked.key] || []), this.tracked.meta];
		return state;
	}

	async track(meta: Meta): Promise<"ok" | "error"> {
		this.tracked = { key: this.presenceKey, meta };
		return this.raw({ t: "tr", k: this.presenceKey, p: meta }) ? "ok" : "error";
	}

	async send(message: { type: "broadcast"; event: string; payload?: unknown }): Promise<"ok" | "timed out" | "error"> {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.joined) return "error";
		if (!this.wantAck) return this.raw({ t: "b", e: message.event, p: message.payload ?? {} }) ? "ok" : "error";
		const a = ++this.ackId;
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				this.acks.delete(a);
				resolve("timed out");
			}, ACK_TIMEOUT_MS);
			this.acks.set(a, (result) => {
				clearTimeout(timer);
				resolve(result);
			});
			if (!this.raw({ t: "b", e: message.event, p: message.payload ?? {}, a })) this.acks.get(a)?.("error");
		});
	}

	async unsubscribe(): Promise<"ok"> {
		this.closed = true;
		this.timers.forEach(clearTimeout);
		this.timers.clear();
		if (this.ping) clearInterval(this.ping);
		this.acks.forEach((done) => done("error"));
		this.acks.clear();
		const ws = this.ws;
		this.ws = null;
		try {
			ws?.close(1000, "leave");
		} catch {
			// already closed
		}
		this.statusCb?.("CLOSED");
		return "ok";
	}

	private raw(frame: unknown): boolean {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
		try {
			this.ws.send(JSON.stringify(frame));
			return true;
		} catch {
			return false;
		}
	}

	private later(fn: () => void, ms: number): void {
		const timer = setTimeout(() => {
			this.timers.delete(timer);
			fn();
		}, ms);
		this.timers.add(timer);
	}

	private emitPresence(event: "join" | "leave" | "sync", key?: string, metas?: Meta[]): void {
		const currentPresences = key ? this.presence[key] || [] : [];
		for (const l of this.listeners) {
			if (l.type !== "presence" || l.event !== event) continue;
			if (event === "sync") l.cb(undefined);
			else if (event === "join") l.cb({ key, currentPresences, newPresences: metas || [] });
			else l.cb({ key, currentPresences, leftPresences: metas || [] });
		}
	}

	private async open(): Promise<void> {
		if (this.closed) return;
		// The worker only admits a Supabase session; a guest gets the same invisible anonymous one Versus uses.
		let { data } = await supabase.auth.getSession();
		if (!data.session) {
			await ensureOnlineIdentity();
			({ data } = await supabase.auth.getSession());
		}
		const token = data.session?.access_token;
		if (this.closed) return;
		if (!token) {
			this.statusCb?.("CHANNEL_ERROR", new Error("not signed in"));
			return;
		}
		const ws = new WebSocket(`${roomsBase()}/room/${encodeURIComponent(this.topic)}?token=${encodeURIComponent(token)}`);
		this.ws = ws;
		this.joined = false;
		const timeout = setTimeout(() => {
			if (this.ws === ws && !this.joined) {
				this.statusCb?.("TIMED_OUT");
				try {
					ws.close();
				} catch {
					// ignore
				}
			}
		}, CONNECT_TIMEOUT_MS);
		ws.onmessage = (event) => {
			if (this.ws !== ws || typeof event.data !== "string" || event.data === "pong") return;
			let msg: any;
			try {
				msg = JSON.parse(event.data);
			} catch {
				return;
			}
			if (msg.t === "ps") this.onState(msg.s || {}, timeout);
			else if (msg.t === "b") {
				for (const l of this.listeners) {
					if (l.type === "broadcast" && (l.event === msg.e || l.event === "*")) l.cb({ type: "broadcast", event: msg.e, payload: msg.p });
				}
			} else if (msg.t === "ack") this.acks.get(msg.a)?.("ok"), this.acks.delete(msg.a);
			else if (msg.t === "pj") {
				(this.presence[msg.k] ||= []).push(msg.p || {});
				this.emitPresence("join", msg.k, [msg.p || {}]);
				this.emitPresence("sync");
			} else if (msg.t === "pl") {
				const list = this.presence[msg.k] || [];
				list.pop();
				if (!list.length) delete this.presence[msg.k];
				this.emitPresence("leave", msg.k, [msg.p || {}]);
				this.emitPresence("sync");
			}
		};
		ws.onclose = () => {
			clearTimeout(timeout);
			if (this.ws !== ws || this.closed) return;
			if (this.ping) clearInterval(this.ping);
			this.ping = null;
			this.ws = null;
			const wasJoined = this.joined;
			this.joined = false;
			this.acks.forEach((done) => done("error"));
			this.acks.clear();
			if (wasJoined) this.statusCb?.("CHANNEL_ERROR", new Error("connection lost"));
			if (this.attempt >= RETRY_MS.length) {
				if (!wasJoined) this.statusCb?.("CHANNEL_ERROR", new Error("rooms server unavailable"));
				return;
			}
			this.later(() => void this.open(), RETRY_MS[this.attempt++]);
		};
	}

	private onState(state: Record<string, Meta[]>, timeout: ReturnType<typeof setTimeout>): void {
		clearTimeout(timeout);
		const before = this.presence;
		this.presence = state;
		this.joined = true;
		this.attempt = 0;
		if (this.ping) clearInterval(this.ping);
		this.ping = setInterval(() => this.raw("ping"), PING_MS);
		if (this.tracked) this.raw({ t: "tr", k: this.tracked.key, p: this.tracked.meta });
		for (const key of Object.keys(before)) if (!state[key]) this.emitPresence("leave", key, before[key]);
		for (const key of Object.keys(state)) if (!before[key]) this.emitPresence("join", key, state[key]);
		this.emitPresence("sync");
		this.statusCb?.("SUBSCRIBED");
	}
}

/** supabase.channel / removeChannel for online rooms, on whichever backend the flag selects. */
export const realtime = {
	channel(topic: string, opts?: RealtimeChannelOptions): RealtimeChannel {
		if (backend === "cloudflare") return new RoomChannel(topic, opts) as unknown as RealtimeChannel;
		return supabase.channel(topic, opts);
	},
	removeChannel(channel: RealtimeChannel | RoomChannel): void {
		if (channel instanceof RoomChannel) void channel.unsubscribe();
		else void supabase.removeChannel(channel);
	},
};

// Fetch the flag as soon as anything online is imported.
void loadRealtimeBackend();
