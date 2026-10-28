import { atom, useAtom } from "jotai";
import { useEffect } from "react";
import { supabase } from "@/constants/Supabase";

// An invitation to a room game in More Games (Durak, Sea Battle, Tic-Tac-Toe): the host opens a room as usual, picks a
// friend who is online and the room code goes over the friend's invite channel (the one the 1v1 and chess invites
// use). The friend gets the usual invite popup; on accept the game opens and joins that room by itself. Live only: a
// friend whose app is closed gets no push for it.

export type InviteGame = "durak" | "battleship" | "tictactoe";
export const INVITE_GAMES: InviteGame[] = ["durak", "battleship", "tictactoe"];

export interface GameInvite {
	game: InviteGame;
	code: string;
	hostName: string;
}

/** Set when an invitation was accepted; the game it is for reads it, joins the room and clears it. */
export const gameInviteAtom = atom<GameInvite | null>(null);

/** Validates what came over the wire: a known game, a short alphanumeric code and a name. */
export function parseGameInvite(payload: unknown): GameInvite | null {
	if (!payload || typeof payload !== "object") return null;
	const row = payload as Record<string, unknown>;
	if (typeof row.game !== "string" || !(INVITE_GAMES as string[]).includes(row.game)) return null;
	if (typeof row.code !== "string" || !/^[A-Za-z0-9]{4,12}$/.test(row.code)) return null;
	const hostName = typeof row.hostName === "string" && row.hostName.trim() ? row.hostName.trim().slice(0, 24) : "Player";
	return { game: row.game as InviteGame, code: row.code.toUpperCase(), hostName };
}

/** Sends the invitation to the friend; false when the channel could not be reached. */
export async function sendGameInvite(friendId: string, invite: GameInvite): Promise<boolean> {
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
			event: "game_invite",
			payload: { game: invite.game, code: invite.code, hostName: invite.hostName },
		});
		supabase.removeChannel(channel);
		return result === "ok";
	} catch {
		return false;
	}
}

/** A game calls this with the way it joins a room: an accepted invitation for this game joins once, then is cleared. */
export function useIncomingGameInvite(game: InviteGame, join: (code: string) => void) {
	const [invite, setInvite] = useAtom(gameInviteAtom);
	useEffect(() => {
		if (!invite || invite.game !== game) return;
		setInvite(null);
		join(invite.code);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [invite, game]);
}
