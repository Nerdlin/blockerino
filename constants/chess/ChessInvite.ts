import { atom } from "jotai";
import { supabase } from "@/constants/Supabase";
import { TimeControl, parseTimeControl } from "./TimeControls";

// A chess challenge to a friend: the host opens a room with a random code and sends the code over the friend's invite
// channel (the same live channel the 1v1 invites use). The friend gets the usual invite popup, accepts, and the chess
// screen opens straight into that room as Black. Live only: a friend whose app is closed does not get a push for it.

export interface ChessInvite {
	code: string;
	hostName: string;
	control: TimeControl;
}

/** Set when a challenge was accepted; ChessOnlineGame reads it, joins the room and clears it. */
export const chessInviteAtom = atom<ChessInvite | null>(null);

export function makeInviteCode(rng: () => number = Math.random): string {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	let code = "";
	for (let i = 0; i < 8; i++) code += alphabet[Math.floor(rng() * alphabet.length)];
	return code;
}

/** Validates what came over the wire: a short alphanumeric code, a sane time control and a name. */
export function parseChessInvite(payload: unknown): ChessInvite | null {
	if (!payload || typeof payload !== "object") return null;
	const row = payload as Record<string, unknown>;
	const control = parseTimeControl(row.control);
	if (!control) return null;
	if (typeof row.code !== "string" || !/^[A-Za-z0-9]{4,12}$/.test(row.code)) return null;
	const hostName = typeof row.hostName === "string" && row.hostName.trim() ? row.hostName.trim().slice(0, 24) : "Player";
	return { code: row.code.toUpperCase(), hostName, control };
}

/** Sends the challenge to the friend; false when the channel could not be reached. */
export async function sendChessInvite(friendId: string, invite: ChessInvite): Promise<boolean> {
	try {
		const channel = supabase.channel(`invites:${friendId}`);
		const subscribed = await new Promise<boolean>((resolve) => {
			const timeout = setTimeout(() => resolve(false), 5000);
			channel.subscribe((status) => {
				if (status === "SUBSCRIBED") {
					clearTimeout(timeout);
					resolve(true);
				} else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
					clearTimeout(timeout);
					resolve(false);
				}
			});
		});
		if (!subscribed) {
			supabase.removeChannel(channel);
			return false;
		}
		const result = await channel.send({
			type: "broadcast",
			event: "chess_invite",
			payload: { code: invite.code, hostName: invite.hostName, control: invite.control.id },
		});
		supabase.removeChannel(channel);
		return result === "ok";
	} catch {
		return false;
	}
}
