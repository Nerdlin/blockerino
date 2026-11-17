import { DurableObject } from "cloudflare:workers";

// Online rooms for Blockerino: one Durable Object per topic ("room:<id>", "more-games:<game>:<code>").
// It relays broadcasts between the sockets of a room and keeps presence, the subset of Supabase Realtime the
// game uses (see constants/RoomSocket.ts for the client side and docs/realtime-cloudflare-plan.md).
//
// Wire format, JSON text frames:
//   client -> room  {t:"b", e:event, p:payload, a?:ackId}   broadcast to the other sockets
//                   {t:"tr", k:key, p:meta}                track presence under key
//                   "ping"                                 answered with "pong" without waking the object
//   room -> client  {t:"ps", s:{key:[meta]}}               presence state, sent once on join
//                   {t:"b", e, p} {t:"ack", a}
//                   {t:"pj", k, p} {t:"pl", k, p}          presence join / leave

export interface Env {
	ROOMS: DurableObjectNamespace<Room>;
	SUPABASE_URL: string;
	SUPABASE_ANON_KEY: string;
}

const TOPIC = /^(room|more-games):[A-Za-z0-9_:-]{1,96}$/;
// A player's invitation inbox: only the owner listens (any of their devices), only an accepted friend sends,
// over HTTP POST /send/invites:<user id>. Inbox sockets cannot broadcast.
const INBOX = /^invites:([0-9a-f-]{36})$/;
const MAX_INVITE = 4 * 1024;
const MAX_SOCKETS = 16; // two players plus spectators
const MAX_FRAME = 64 * 1024;
const MAX_PER_SECOND = 40;
// Clients ping every 15 s. A socket silent for longer than this is a dropped phone or a closed tab whose TCP
// connection never ended; the room drops it so the other player sees the leave (Supabase presence does the same).
const STALE_MS = 45_000;
const SWEEP_MS = 20_000;

type Attachment = { user: string; at: number; key?: string; meta?: unknown };

export class Room extends DurableObject<Env> {
	private rate = new WeakMap<WebSocket, { second: number; count: number }>();
	private lastMessage = new WeakMap<WebSocket, number>();

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
	}

	async fetch(request: Request): Promise<Response> {
		const user = request.headers.get("x-room-user") || "";
		if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return new Response("room full", { status: 429 });
		const { 0: client, 1: server } = new WebSocketPair();
		this.ctx.acceptWebSocket(server, [request.headers.get("x-room-kind") === "inbox" ? "inbox" : "room"]);
		server.serializeAttachment({ user, at: Date.now() } satisfies Attachment);
		if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + SWEEP_MS);
		server.send(JSON.stringify({ t: "ps", s: this.presenceState() }));
		return new Response(null, { status: 101, webSocket: client });
	}

	/** Hands an invitation to every open socket of the inbox; returns how many got it. */
	async deliver(event: string, payload: unknown): Promise<number> {
		const frame = JSON.stringify({ t: "b", e: event, p: payload ?? {} });
		let n = 0;
		for (const ws of this.ctx.getWebSockets()) {
			try {
				ws.send(frame);
				n++;
			} catch {
				// closing
			}
		}
		return n;
	}

	private presenceState(): Record<string, unknown[]> {
		const state: Record<string, unknown[]> = {};
		for (const ws of this.ctx.getWebSockets()) {
			const a = ws.deserializeAttachment() as Attachment | null;
			if (a?.key) (state[a.key] ||= []).push(a.meta ?? {});
		}
		return state;
	}

	private others(from: WebSocket, frame: string): void {
		for (const ws of this.ctx.getWebSockets()) {
			if (ws === from) continue;
			try {
				ws.send(frame);
			} catch {
				// a socket that is closing; webSocketClose cleans it up
			}
		}
	}

	private limited(ws: WebSocket): boolean {
		const second = Math.floor(Date.now() / 1000);
		const r = this.rate.get(ws);
		if (!r || r.second !== second) {
			this.rate.set(ws, { second, count: 1 });
			return false;
		}
		return ++r.count > MAX_PER_SECOND;
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		this.lastMessage.set(ws, Date.now());
		if (typeof message !== "string" || message.length > MAX_FRAME || this.limited(ws)) return;
		let msg: { t?: string; e?: unknown; p?: unknown; a?: unknown; k?: unknown };
		try {
			msg = JSON.parse(message);
		} catch {
			return;
		}
		if (msg.t === "b" && typeof msg.e === "string") {
			if (this.ctx.getTags(ws).includes("inbox")) return;
			this.others(ws, JSON.stringify({ t: "b", e: msg.e, p: msg.p ?? {} }));
			if (typeof msg.a === "number") ws.send(JSON.stringify({ t: "ack", a: msg.a }));
			return;
		}
		if (msg.t === "tr" && typeof msg.k === "string" && msg.k.length <= 96) {
			const a = (ws.deserializeAttachment() as Attachment | null) || { user: "", at: Date.now() };
			if (a.key && a.key !== msg.k) this.others(ws, JSON.stringify({ t: "pl", k: a.key, p: a.meta ?? {} }));
			// One socket per presence key: a player who reconnects before the room noticed the old socket dropping
			// takes the key over. The old socket goes quietly, so a late "leave" never follows the new "join".
			for (const other of this.ctx.getWebSockets()) {
				if (other === ws) continue;
				const o = other.deserializeAttachment() as Attachment | null;
				if (o?.key !== msg.k) continue;
				other.serializeAttachment({ user: o.user, at: o.at } satisfies Attachment);
				try {
					other.close(4002, "replaced");
				} catch {
					// already gone
				}
			}
			ws.serializeAttachment({ user: a.user, at: a.at, key: msg.k, meta: msg.p ?? {} } satisfies Attachment);
			this.others(ws, JSON.stringify({ t: "pj", k: msg.k, p: msg.p ?? {} }));
		}
	}

	private left(ws: WebSocket): void {
		const a = ws.deserializeAttachment() as Attachment | null;
		if (!a?.key) return;
		ws.serializeAttachment({ user: a.user, at: a.at } satisfies Attachment);
		this.others(ws, JSON.stringify({ t: "pl", k: a.key, p: a.meta ?? {} }));
	}

	async alarm(): Promise<void> {
		const now = Date.now();
		for (const ws of this.ctx.getWebSockets()) {
			const a = ws.deserializeAttachment() as Attachment | null;
			const seen = Math.max(this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0, this.lastMessage.get(ws) ?? 0, a?.at ?? 0);
			if (now - seen < STALE_MS) continue;
			this.left(ws);
			try {
				ws.close(4000, "stale");
			} catch {
				// already gone
			}
		}
		if (this.ctx.getWebSockets().length) await this.ctx.storage.setAlarm(now + SWEEP_MS);
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
		this.left(ws);
		try {
			ws.close(code === 1005 || code === 1006 ? 1000 : code, "bye");
		} catch {
			// already closed
		}
	}

	async webSocketError(ws: WebSocket): Promise<void> {
		this.left(ws);
	}
}

// ---- Supabase access token check (ES256, keys from the project JWKS) ----

type Jwk = JsonWebKey & { kid?: string };
let jwks: { at: number; keys: Jwk[] } | null = null;

async function signingKeys(env: Env, refresh = false): Promise<Jwk[]> {
	if (!refresh && jwks && Date.now() - jwks.at < 10 * 60_000) return jwks.keys;
	const res = await fetch(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`, { cf: { cacheTtl: 600 } });
	if (!res.ok) throw new Error("jwks " + res.status);
	const body = (await res.json()) as { keys: Jwk[] };
	jwks = { at: Date.now(), keys: body.keys };
	return body.keys;
}

function b64url(input: string): Uint8Array {
	const s = input.replace(/-/g, "+").replace(/_/g, "/");
	const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
	return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Returns the user id (sub) of a valid, unexpired Supabase access token, or null. */
export async function verifyToken(token: string, env: Env): Promise<string | null> {
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	try {
		const header = JSON.parse(new TextDecoder().decode(b64url(parts[0]))) as { alg?: string; kid?: string };
		const claims = JSON.parse(new TextDecoder().decode(b64url(parts[1]))) as { sub?: string; exp?: number; aud?: string | string[]; iss?: string };
		if (header.alg !== "ES256") return null;
		let jwk = (await signingKeys(env)).find((k) => k.kid === header.kid);
		if (!jwk) jwk = (await signingKeys(env, true)).find((k) => k.kid === header.kid);
		if (!jwk) return null;
		const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
		const ok = await crypto.subtle.verify(
			{ name: "ECDSA", hash: "SHA-256" },
			key,
			b64url(parts[2]),
			new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
		);
		if (!ok) return null;
		if (!claims.sub || !claims.exp || claims.exp * 1000 < Date.now()) return null;
		const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
		if (!aud.includes("authenticated")) return null;
		if (claims.iss !== `${env.SUPABASE_URL}/auth/v1`) return null;
		return claims.sub;
	} catch {
		return null;
	}
}

const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
	"Access-Control-Allow-Headers": "authorization, content-type",
	"Access-Control-Max-Age": "86400",
};

function reply(body: string, status: number): Response {
	return new Response(body, { status, headers: CORS });
}

/** Whether sender and receiver are accepted friends, asked as the sender (friends RLS lets each side read the row). */
async function areFriends(env: Env, token: string, sender: string, receiver: string): Promise<boolean> {
	const q = `or=(and(user_id_1.eq.${sender},user_id_2.eq.${receiver}),and(user_id_1.eq.${receiver},user_id_2.eq.${sender}))`;
	const res = await fetch(`${env.SUPABASE_URL}/rest/v1/friends?select=status&status=eq.accepted&limit=1&${q}`, {
		headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
	});
	if (!res.ok) return false;
	return ((await res.json()) as unknown[]).length > 0;
}

async function sendInvite(request: Request, env: Env, topic: string): Promise<Response> {
	const inbox = topic.match(INBOX);
	if (!inbox) return reply("bad topic", 400);
	const token = (request.headers.get("authorization") || "").replace(/^Bearer /i, "");
	const sender = await verifyToken(token, env);
	if (!sender) return reply("unauthorized", 401);
	const text = await request.text();
	if (text.length > MAX_INVITE) return reply("too large", 413);
	let body: { event?: unknown; payload?: unknown };
	try {
		body = JSON.parse(text);
	} catch {
		return reply("bad json", 400);
	}
	if (typeof body.event !== "string" || body.event.length > 40) return reply("bad event", 400);
	if (sender === inbox[1] || !(await areFriends(env, token, sender, inbox[1]))) return reply("forbidden", 403);
	const reached = await env.ROOMS.getByName(topic).deliver(body.event, body.payload ?? {});
	return new Response(JSON.stringify({ ok: true, reached }), { headers: { ...CORS, "content-type": "application/json" } });
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		// Discord Activities reach the worker through the /rooms URL mapping, so accept that prefix too.
		const path = url.pathname.replace(/^\/rooms(?=\/)/, "");
		if (path === "/health") return new Response("ok");
		if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
		const send = path.match(/^\/send\/(.+)$/);
		if (send && request.method === "POST") return sendInvite(request, env, decodeURIComponent(send[1]));
		const match = path.match(/^\/room\/(.+)$/);
		if (!match) return new Response("not found", { status: 404 });
		const topic = decodeURIComponent(match[1]);
		const inbox = topic.match(INBOX);
		if (!inbox && !TOPIC.test(topic)) return new Response("bad topic", { status: 400 });
		if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("expected websocket", { status: 426 });
		const user = await verifyToken(url.searchParams.get("token") || "", env);
		if (!user) return new Response("unauthorized", { status: 401 });
		if (inbox && inbox[1] !== user) return new Response("forbidden", { status: 403 });
		const headers = new Headers(request.headers);
		headers.set("x-room-user", user);
		headers.set("x-room-kind", inbox ? "inbox" : "room");
		return env.ROOMS.getByName(topic).fetch(new Request(request, { headers }));
	},
} satisfies ExportedHandler<Env>;
