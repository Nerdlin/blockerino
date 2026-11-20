import { Clipboard, Platform, Share } from "react-native";
import { atom } from "jotai";
import { INVITE_GAMES, type InviteGame } from "./GameInvite";

// A room can be shared as a link (WhatsApp, Telegram...). It opens public/join.html on the site, which sends an Android
// phone with the app into the app (com.nerdlin.blockerino://join?g=..&c=..) and everyone else into the web game
// (/?join=game:CODE). There the game opens the room's screen and joins the room by itself (JoinLinkHost).

// Chess is not an InviteGame (its friend challenge carries a time control and has its own flow), but its room opens by link like the rest.
export type JoinGame = "versus" | "chess" | InviteGame;
export const JOIN_GAMES: JoinGame[] = ["versus", "chess", ...INVITE_GAMES];

export interface JoinTarget {
	game: JoinGame;
	code: string;
}

export const SITE = "https://blockerino.aionerdlin.me";

export function buildJoinLink(game: JoinGame, code: string): string {
	return `${SITE}/join.html?g=${encodeURIComponent(game)}&c=${encodeURIComponent(code.toUpperCase())}`;
}

function valid(game: string | null, code: string | null): JoinTarget | null {
	if (!game || !code || !(JOIN_GAMES as string[]).includes(game) || !/^[A-Za-z0-9]{4,12}$/.test(code)) return null;
	return { game: game as JoinGame, code: code.toUpperCase() };
}

function param(url: string, name: string): string | null {
	const match = new RegExp(`[?&#]${name}=([^&#]+)`).exec(url);
	return match ? decodeURIComponent(match[1]) : null;
}

/** The room a link points to: the app's com.nerdlin.blockerino://join?g=..&c=.. or the web game's ?join=game:CODE. */
export function parseJoinLink(url: string | null | undefined): JoinTarget | null {
	if (!url) return null;
	const web = param(url, "join");
	if (web) {
		const [game, code] = web.split(":");
		return valid(game ?? null, code ?? null);
	}
	if (!/:\/\/join\b/.test(url)) return null;
	return valid(param(url, "g"), param(url, "c"));
}

/** A Versus room code from a link, picked up by the Versus menu, which joins the room and clears it. */
export const versusJoinAtom = atom<string | null>(null);

/** Shares the room: the share sheet on a phone, the browser's share or the clipboard on the web. "copied" when copied. */
export async function shareJoinLink(game: JoinGame, code: string, message: string): Promise<"shared" | "copied" | "failed"> {
	const url = buildJoinLink(game, code);
	const text = `${message} ${url}`;
	try {
		if (Platform.OS === "web") {
			const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }) : undefined;
			if (nav?.share) {
				await nav.share({ text: message, url });
				return "shared";
			}
			Clipboard.setString(text);
			return "copied";
		}
		await Share.share({ message: text });
		return "shared";
	} catch {
		try {
			Clipboard.setString(text);
			return "copied";
		} catch {
			return "failed";
		}
	}
}
