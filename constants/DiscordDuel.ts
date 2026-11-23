import { GameModeType } from "@/hooks/useAppState";

// A duel challenge between two people who are in the same Discord Activity (a voice channel). They share a small room
// channel named after the Activity instance ("room:discord-<instance id>"); the challenge is one broadcast on it addressed to a
// Discord id. Nothing here touches the duel itself: the host creates the usual private room, the challenged player gets the
// usual invite popup and joins it, as with a friend's invite (see hooks/useFriendInvite.ts and hooks/useInviteListener.ts).

export const DISCORD_DUEL_INVITE = "duel_invite";
export const DISCORD_DUEL_DECLINED = "duel_declined";
export const DISCORD_DUEL_BUSY = "duel_busy";

export interface DiscordDuelInvite {
	roomId: string;
	hostName: string;
	mode: GameModeType;
	fromId: string;
}

/** The channel every participant of one Activity instance listens on; null when the instance id looks odd. */
export function discordDuelTopic(instanceId: unknown): string | null {
	if (typeof instanceId !== "string") return null;
	const clean = instanceId.replace(/[^A-Za-z0-9_-]/g, "");
	if (clean.length < 4) return null;
	return `room:discord-${clean.slice(0, 80)}`;
}

export function buildDiscordDuelInvite(toId: string, fromId: string, roomId: string, hostName: string, mode: GameModeType): Record<string, unknown> {
	return { to: toId, from: fromId, roomId, hostName: hostName.slice(0, 24), mode };
}

const DISCORD_ID = /^\d{5,25}$/;
const ROOM_ID = /^[0-9a-fA-F-]{36}$/;

/** What came over the channel, accepted only when it is addressed to this player and well formed. */
export function parseDiscordDuelInvite(payload: unknown, selfId: string | null): DiscordDuelInvite | null {
	if (!selfId || !payload || typeof payload !== "object") return null;
	const row = payload as Record<string, unknown>;
	if (row.to !== selfId || typeof row.from !== "string" || !DISCORD_ID.test(row.from) || row.from === selfId) return null;
	if (typeof row.roomId !== "string" || !ROOM_ID.test(row.roomId)) return null;
	const hostName = typeof row.hostName === "string" && row.hostName.trim() ? row.hostName.trim().slice(0, 24) : "Player";
	const mode = Object.values(GameModeType).includes(row.mode as GameModeType) ? (row.mode as GameModeType) : GameModeType.Classic;
	return { roomId: row.roomId, hostName, mode, fromId: row.from };
}

/** The answer ("declined", "busy") is read only by the host the invitation came from. */
export function parseDiscordDuelAnswer(payload: unknown, selfId: string | null): string | null {
	if (!selfId || !payload || typeof payload !== "object") return null;
	const row = payload as Record<string, unknown>;
	return row.to === selfId && typeof row.roomId === "string" && ROOM_ID.test(row.roomId) ? row.roomId : null;
}
