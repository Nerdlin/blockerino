import { loadRealtimeBackend, realtime } from "./RoomSocket";
import {
	DISCORD_DUEL_BUSY,
	DISCORD_DUEL_DECLINED,
	DISCORD_DUEL_INVITE,
	discordDuelTopic,
	parseDiscordDuelAnswer,
	parseDiscordDuelInvite,
	type DiscordDuelInvite,
} from "./DiscordDuel";

// The live channel of one Discord Activity instance for duel challenges (see constants/DiscordDuel.ts). It is opened by
// hooks/useInviteListener while the Activity runs; the lobby panel sends through the same channel.

type Channel = ReturnType<typeof realtime.channel>;

let channel: Channel | null = null;
let subscribed = false;
let waiters: Array<(ok: boolean) => void> = [];

export interface DuelChannelHandlers {
	onInvite: (invite: DiscordDuelInvite) => void;
	onDeclined: (roomId: string) => void;
	onBusy: (roomId: string) => void;
}

/** Opens the instance channel and returns the function that closes it. A second call while open does nothing. */
export function startDiscordDuelChannel(instanceId: unknown, selfId: string | null, handlers: DuelChannelHandlers): () => void {
	const topic = discordDuelTopic(instanceId);
	if (!topic || !selfId || channel) return () => undefined;
	let cancelled = false;
	void loadRealtimeBackend().then(() => {
		if (cancelled) return;
		const next = realtime
			.channel(topic, { config: { broadcast: { self: false } } })
			.on("broadcast", { event: DISCORD_DUEL_INVITE }, (message: { payload?: unknown }) => {
				const invite = parseDiscordDuelInvite(message?.payload, selfId);
				if (invite) handlers.onInvite(invite);
			})
			.on("broadcast", { event: DISCORD_DUEL_DECLINED }, (message: { payload?: unknown }) => {
				const roomId = parseDiscordDuelAnswer(message?.payload, selfId);
				if (roomId) handlers.onDeclined(roomId);
			})
			.on("broadcast", { event: DISCORD_DUEL_BUSY }, (message: { payload?: unknown }) => {
				const roomId = parseDiscordDuelAnswer(message?.payload, selfId);
				if (roomId) handlers.onBusy(roomId);
			})
			.subscribe((status: string) => {
				subscribed = status === "SUBSCRIBED";
				if (subscribed) {
					waiters.forEach((resolve) => resolve(true));
					waiters = [];
				}
			});
		channel = next;
	});
	return () => {
		cancelled = true;
		if (channel) realtime.removeChannel(channel);
		channel = null;
		subscribed = false;
		waiters.forEach((resolve) => resolve(false));
		waiters = [];
	};
}

async function whenSubscribed(): Promise<boolean> {
	if (subscribed) return true;
	if (!channel) return false;
	return new Promise((resolve) => {
		const timer = setTimeout(() => resolve(false), 5000);
		waiters.push((ok) => {
			clearTimeout(timer);
			resolve(ok);
		});
	});
}

/** Sends one event on the instance channel; false when the channel is not up. */
export async function sendDiscordDuelEvent(event: string, payload: Record<string, unknown>): Promise<boolean> {
	if (!(await whenSubscribed()) || !channel) return false;
	try {
		const result = await (channel as unknown as { send: (message: { type: "broadcast"; event: string; payload: unknown }) => Promise<string> }).send({ type: "broadcast", event, payload });
		return result === "ok";
	} catch {
		return false;
	}
}
