import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase, type GlobalHighScore } from "./Supabase";
import { getShopItem, normalizeShopState, type ShopState } from "./Shop";

// What happens after a season closes (public.close_season()): final top-10 tables, rewards for
// the top 10 (coins, plus an exclusive background for the podium) and the soft Versus elo reset.

export type SeasonResultBoard = "classic" | "chaos" | "elo";

export const SEASON_RESULT_BOARDS: SeasonResultBoard[] = ["classic", "chaos", "elo"];

export interface SeasonRewardEntry {
	seasonKey: string;
	board: SeasonResultBoard;
	rank: number;
	coins: number;
	itemId: string | null;
}

export interface SeasonRewardSummary {
	coins: number;
	itemIds: string[];
	entries: SeasonRewardEntry[];
}

export interface SeasonResultRow {
	rank: number;
	playerName: string;
	score: number;
	profileId: string | null;
}

export interface SeasonResultsSnapshot {
	seasonKey: string;
	boards: Record<SeasonResultBoard, SeasonResultRow[]>;
}

export interface EloSeasonReset {
	before: number;
	after: number;
	resetAt: string;
}

export interface SeasonTitle {
	seasonKey: string;
	board: SeasonResultBoard;
	rank: number;
}

const PENDING_REWARDS_KEY = "PENDING_SEASON_REWARDS";
const ELO_RESET_SEEN_KEY = "SEASON_ELO_RESET_SEEN";
/** A reset older than this is history, not news (also hides the one-off June 2026 reset). */
export const ELO_RESET_NOTICE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function isBoard(value: unknown): value is SeasonResultBoard {
	return value === "classic" || value === "chaos" || value === "elo";
}

export function parseRewardEntries(raw: unknown): SeasonRewardEntry[] {
	const list = Array.isArray(raw) ? raw : (raw && typeof raw === "object" ? (raw as { entries?: unknown }).entries : null);
	if (!Array.isArray(list)) return [];

	const entries: SeasonRewardEntry[] = [];
	for (const item of list) {
		if (!item || typeof item !== "object") continue;
		const row = item as Record<string, unknown>;
		const seasonKey = row.seasonKey ?? row.season_key;
		const itemId = row.itemId ?? row.item_id;
		const rank = Number(row.rank);
		const coins = Number(row.coins);
		if (typeof seasonKey !== "string" || !isBoard(row.board)) continue;
		if (!Number.isInteger(rank) || rank < 1 || !Number.isFinite(coins) || coins < 0) continue;
		entries.push({
			seasonKey,
			board: row.board,
			rank,
			coins: Math.floor(coins),
			itemId: typeof itemId === "string" && itemId.length > 0 ? itemId : null,
		});
	}
	return entries;
}

/** Totals the rewards of one or more boards; unknown shop items are ignored. */
export function summarizeSeasonRewards(entries: SeasonRewardEntry[]): SeasonRewardSummary {
	const itemIds = new Set<string>();
	let coins = 0;
	for (const entry of entries) {
		coins += entry.coins;
		if (entry.itemId && getShopItem(entry.itemId)) itemIds.add(entry.itemId);
	}
	return { coins, itemIds: [...itemIds], entries };
}

/** Adds the reward coins and items to a shop state (items already owned are not duplicated). */
export function applySeasonRewardsToShop(state: ShopState, summary: SeasonRewardSummary): ShopState {
	const current = normalizeShopState(state);
	return {
		...current,
		balance: current.balance + Math.max(0, Math.floor(summary.coins)),
		ownedItemIds: [...new Set([...current.ownedItemIds, ...summary.itemIds])],
	};
}

export function getBestRewardRank(entries: SeasonRewardEntry[]): number | null {
	return entries.length === 0 ? null : Math.min(...entries.map((entry) => entry.rank));
}

async function readPendingRewards(): Promise<SeasonRewardEntry[]> {
	try {
		const raw = await AsyncStorage.getItem(PENDING_REWARDS_KEY);
		return raw ? parseRewardEntries(JSON.parse(raw)) : [];
	} catch (error) {
		console.error("Error reading pending season rewards:", error);
		return [];
	}
}

export async function clearPendingSeasonRewards(): Promise<void> {
	await AsyncStorage.removeItem(PENDING_REWARDS_KEY);
}

/**
 * Collects the rewards of the signed-in player. The server hands every reward out once, so the
 * result is kept on the device until it has been applied to the shop (clearPendingSeasonRewards).
 */
export async function claimSeasonRewards(): Promise<SeasonRewardEntry[]> {
	const pending = await readPendingRewards();
	let claimed: SeasonRewardEntry[] = [];

	try {
		const { data: { session } } = await supabase.auth.getSession();
		if (session?.user) {
			const { data, error } = await supabase.rpc("claim_season_rewards");
			if (error) throw error;
			claimed = parseRewardEntries(data);
		}
	} catch (error) {
		console.error("Error claiming season rewards:", error);
	}

	const all = [...pending, ...claimed];
	if (claimed.length > 0) {
		await AsyncStorage.setItem(PENDING_REWARDS_KEY, JSON.stringify(all));
	}
	return all;
}

export function shouldAnnounceEloReset(
	reset: EloSeasonReset | null,
	lastSeenResetAt: string | null,
	now: number = Date.now()
): boolean {
	if (!reset || reset.before <= 0) return false;
	const resetTime = Date.parse(reset.resetAt);
	if (!Number.isFinite(resetTime) || now - resetTime > ELO_RESET_NOTICE_WINDOW_MS) return false;
	return lastSeenResetAt !== reset.resetAt;
}

/** The signed-in player's latest Versus elo reset, if it has not been announced yet. */
export async function getUnseenEloReset(): Promise<EloSeasonReset | null> {
	try {
		const { data: { session } } = await supabase.auth.getSession();
		if (!session?.user) return null;

		const { data, error } = await supabase
			.from("profiles")
			.select("elo, previous_elo, elo_reset_at")
			.eq("auth_user_id", session.user.id)
			.maybeSingle();
		if (error || !data || data.elo_reset_at == null || data.previous_elo == null) return null;

		const reset: EloSeasonReset = {
			before: Number(data.previous_elo),
			after: Number(data.elo ?? 0),
			resetAt: String(data.elo_reset_at),
		};
		const seen = await AsyncStorage.getItem(ELO_RESET_SEEN_KEY);
		return shouldAnnounceEloReset(reset, seen) ? reset : null;
	} catch (error) {
		console.error("Error reading elo reset:", error);
		return null;
	}
}

export async function markEloResetSeen(resetAt: string): Promise<void> {
	await AsyncStorage.setItem(ELO_RESET_SEEN_KEY, resetAt);
}

function emptyBoards(): Record<SeasonResultBoard, SeasonResultRow[]> {
	return { classic: [], chaos: [], elo: [] };
}

/** Final top 10 of every board for the most recently closed season, or null before the first one. */
export async function getLatestSeasonResults(): Promise<SeasonResultsSnapshot | null> {
	try {
		const { data: latest, error: latestError } = await supabase
			.from("season_results")
			.select("season_key")
			.order("season_key", { ascending: false })
			.limit(1);
		if (latestError || !latest || latest.length === 0) {
			if (latestError) console.error("Error fetching latest season:", latestError);
			return null;
		}

		const seasonKey = String(latest[0].season_key);
		const { data, error } = await supabase
			.from("season_results")
			.select("board, rank, profile_id, player_name, score")
			.eq("season_key", seasonKey)
			.order("rank", { ascending: true });
		if (error || !data) {
			if (error) console.error("Error fetching season results:", error);
			return null;
		}

		const boards = emptyBoards();
		for (const row of data) {
			if (!isBoard(row.board)) continue;
			boards[row.board].push({
				rank: Number(row.rank),
				playerName: row.player_name || "Player",
				score: Number(row.score) || 0,
				profileId: row.profile_id ?? null,
			});
		}
		return { seasonKey, boards };
	} catch (error) {
		console.error("Error fetching season results:", error);
		return null;
	}
}

/** Season-result rows as the leaderboard row component expects them. */
export function toLeaderboardRows(rows: SeasonResultRow[], board: SeasonResultBoard): GlobalHighScore[] {
	return rows.map((row) => ({
		player_name: row.playerName,
		score: row.score,
		game_mode: board,
	}));
}

/** Best finishes first (lowest rank, then most recent season). */
export function sortSeasonTitles(titles: SeasonTitle[]): SeasonTitle[] {
	return [...titles].sort((a, b) => a.rank - b.rank || b.seasonKey.localeCompare(a.seasonKey));
}

/** Permanent record of the signed-in player's past top-10 finishes. */
export async function getMySeasonTitles(limit: number = 3): Promise<SeasonTitle[]> {
	try {
		const { data: { session } } = await supabase.auth.getSession();
		if (!session?.user) return [];

		const { data: profile } = await supabase
			.from("profiles")
			.select("id")
			.eq("auth_user_id", session.user.id)
			.maybeSingle();
		if (!profile?.id) return [];

		const { data, error } = await supabase
			.from("season_results")
			.select("season_key, board, rank")
			.eq("profile_id", profile.id);
		if (error || !data) return [];

		const titles: SeasonTitle[] = [];
		for (const row of data) {
			if (!isBoard(row.board)) continue;
			titles.push({ seasonKey: String(row.season_key), board: row.board, rank: Number(row.rank) });
		}
		return sortSeasonTitles(titles).slice(0, limit);
	} catch (error) {
		console.error("Error fetching season titles:", error);
		return [];
	}
}
