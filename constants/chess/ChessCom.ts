import AsyncStorage from "@react-native-async-storage/async-storage";
import { TimeClass } from "./TimeControls";

// A chess.com account linked by its username. The public API (api.chess.com/pub, no key) gives the ratings, but it
// proves nothing about who owns the account, so the ratings are only shown and used as a hint (which bot to try,
// where the player stands); they never become the player's Elo here.

const LINK_KEY = "CHESSCOM_LINK_V1";
const USERNAME_RE = /^[A-Za-z0-9_-]{3,25}$/;

export interface ChessComLink {
	username: string;
	ratings: Partial<Record<TimeClass, number>>;
	puzzles?: number;
	fetchedAt: number;
}

export type ChessComLookup = { status: "ok"; link: ChessComLink } | { status: "invalid" | "not_found" | "failed" };

export function isChessComUsername(value: string): boolean {
	return USERNAME_RE.test(value.trim());
}

interface StatsEntry {
	last?: { rating?: number };
}

/** Reads the ratings from a /stats response; a time class the player never played is left out. */
export function parseChessComStats(username: string, stats: Record<string, unknown>, now = Date.now()): ChessComLink {
	const pick = (key: string) => {
		const rating = (stats[key] as StatsEntry | undefined)?.last?.rating;
		return typeof rating === "number" && rating > 0 ? rating : undefined;
	};
	const ratings: Partial<Record<TimeClass, number>> = {};
	const bullet = pick("chess_bullet");
	const blitz = pick("chess_blitz");
	const rapid = pick("chess_rapid");
	if (bullet) ratings.bullet = bullet;
	if (blitz) ratings.blitz = blitz;
	if (rapid) ratings.rapid = rapid;
	const tactics = (stats.tactics as { highest?: { rating?: number } } | undefined)?.highest?.rating;
	return { username, ratings, puzzles: typeof tactics === "number" ? tactics : undefined, fetchedAt: now };
}

export async function lookupChessCom(rawUsername: string, fetcher: typeof fetch = fetch): Promise<ChessComLookup> {
	const username = rawUsername.trim();
	if (!isChessComUsername(username)) return { status: "invalid" };
	try {
		const response = await fetcher(`https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/stats`, {
			headers: { Accept: "application/json" },
		});
		// chess.com answers an unknown player with 404 (sometimes 403 from its firewall)
		if (response.status === 404 || response.status === 403) return { status: "not_found" };
		if (!response.ok) return { status: "failed" };
		const stats = (await response.json()) as Record<string, unknown>;
		return { status: "ok", link: parseChessComStats(username, stats) };
	} catch {
		return { status: "failed" };
	}
}

export async function loadChessComLink(): Promise<ChessComLink | null> {
	try {
		const raw = await AsyncStorage.getItem(LINK_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as ChessComLink;
		return parsed && typeof parsed.username === "string" ? parsed : null;
	} catch {
		return null;
	}
}

export async function saveChessComLink(link: ChessComLink | null): Promise<void> {
	try {
		if (link) await AsyncStorage.setItem(LINK_KEY, JSON.stringify(link));
		else await AsyncStorage.removeItem(LINK_KEY);
	} catch {
		// not remembering the link only means asking for it again
	}
}

/** The bot whose Elo is closest to the player's chess.com rating in a time class, to suggest a fair first game. */
export function closestBotElo(rating: number | undefined, botElos: number[]): number | null {
	if (!rating || botElos.length === 0) return null;
	return botElos.reduce((best, elo) => (Math.abs(elo - rating) < Math.abs(best - rating) ? elo : best), botElos[0]);
}
