import { atom } from "jotai";
import { supabase } from "./Supabase";
import { GameModeType } from "@/hooks/useAppState";

// A 1v1 invite this player sent and is waiting on. The game starts only when the friend joins the room; until then
// InviteModeHost shows "waiting for <friend>" with a cancel button.
export type OutgoingInviteStatus = "waiting" | "declined" | "busy" | "timeout";

export interface OutgoingInvite {
	roomId: string;
	friendId: string;
	friendName: string;
	mode: GameModeType;
	myElo: number;
	sentAt: number;
	status: OutgoingInviteStatus;
}

export const outgoingInviteAtom = atom<OutgoingInvite | null>(null);

/** How long the host waits for an answer before the room is closed. */
export const INVITE_WAIT_MS = 60_000;

// ---- "busy": the player is in an online game, so invites are answered "busy" instead of being shown ----

let onlineRooms = 0;

/** Called by online game screens: +1 when the player is in an online room, -1 when they leave it. */
export function markOnlineRoom(delta: 1 | -1): void {
	onlineRooms = Math.max(0, onlineRooms + delta);
}

export function isInOnlineRoom(): boolean {
	return onlineRooms > 0;
}

/** True when the friend plays a 1v1 duel right now (a room in play, touched in the last 20 minutes). */
export async function isFriendInDuel(friendId: string): Promise<boolean> {
	try {
		const since = new Date(Date.now() - 20 * 60 * 1000).toISOString();
		const { data, error } = await supabase
			.from("matchmaking_rooms")
			.select("id")
			.eq("status", "playing")
			.or(`player1_id.eq.${friendId},player2_id.eq.${friendId}`)
			.gte("updated_at", since)
			.limit(1);
		return !error && Array.isArray(data) && data.length > 0;
	} catch {
		return false;
	}
}
