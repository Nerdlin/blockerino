import { atom } from "jotai";
import { noteStreakBest } from "./Achievements";
import { supabase } from "./Supabase";
import { getAccountSession } from './AccountSession';

// Daily login streak: a season calendar of 28 days with chests on days 7, 14, 21 (small) and 28 (big). The server
// owns the streak, rolls the chests and pays everything (streak_chest migration); this file only asks it and
// shows the answer. Missing a day or a new season starts again at day 1. Signed-in players only.

export type ChestSize = "small" | "big";

export interface CalendarDay {
	day: number;
	coins: number;
	chest: ChestSize | null;
}

export type Rarity = "common" | "rare" | "epic" | "legendary";

export const RARITY_COLORS: Record<Rarity, string> = {
	common: "#B8C0CC",
	rare: "#4DA3FF",
	epic: "#B46CFF",
	legendary: "#FFC93C",
};

export type ChestPrize =
	| { size: ChestSize; kind: "coins"; coins: number; rarity: Rarity }
	| { size: ChestSize; kind: "item"; itemId: string; coins: number; rarity: Rarity };

function asRarity(value: unknown): Rarity {
	return value === "rare" || value === "epic" || value === "legendary" ? value : "common";
}

/** The calendar as the server answers it; also what older servers mean (no chests, the old coin table). */
export const CALENDAR_LENGTH = 28;
export function fallbackCalendar(): CalendarDay[] {
	return Array.from({ length: CALENDAR_LENGTH }, (_, i) => {
		const day = i + 1;
		return { day, coins: 50 + 10 * ((day - 1) % 7) + 5 * Math.floor((day - 1) / 7), chest: day === 28 ? "big" : day % 7 === 0 ? "small" : null };
	});
}

export interface DailyRewardStatus {
	/** Current streak; 0 when it was broken or never started. */
	streak: number;
	best: number;
	claimedToday: boolean;
	/** The streak day today's claim (or tomorrow's) would reach. */
	nextStreak: number;
	/** Coins for that day. */
	nextReward: number;
	/** The chest that day opens, if any. */
	nextChest: ChestSize | null;
	calendar: CalendarDay[];
}

export interface DailyRewardClaim {
	streak: number;
	reward: number;
	best: number;
	/** The wallet balance the server answers with. */
	coins: number | null;
	/** Coins for the day after this one. */
	nextReward: number;
	/** The chest this claim opened. */
	chest: ChestPrize | null;
	/** Everything the player owns after the claim (a chest may add an item). */
	ownedItemIds: string[] | null;
}

export const dailyRewardStatusAtom = atom<DailyRewardStatus | null>(null);
/** The menu chip asks the host to open the popup. */
export const dailyRewardOpenAtom = atom(false);

function asNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asChestSize(value: unknown): ChestSize | null {
	return value === "small" || value === "big" ? value : null;
}

function parseCalendar(value: unknown): CalendarDay[] {
	if (!Array.isArray(value) || value.length === 0) return fallbackCalendar();
	const days = value.flatMap((entry) => {
		if (!entry || typeof entry !== "object") return [];
		const row = entry as Record<string, unknown>;
		const day = asNumber(row.day);
		const coins = asNumber(row.coins);
		return day === null || coins === null ? [] : [{ day, coins, chest: asChestSize(row.chest) }];
	});
	return days.length > 0 ? days : fallbackCalendar();
}

function parseChest(value: unknown): ChestPrize | null {
	if (!value || typeof value !== "object") return null;
	const row = value as Record<string, unknown>;
	const size = asChestSize(row.size) ?? "small";
	const coins = asNumber(row.coins) ?? 0;
	const rarity = asRarity(row.rarity);
	if (row.kind === "item" && typeof row.item_id === "string") return { size, kind: "item", itemId: row.item_id, coins, rarity };
	if (row.kind === "coins") return { size, kind: "coins", coins, rarity };
	return null;
}

export function parseDailyRewardStatus(data: unknown): DailyRewardStatus | null {
	if (!data || typeof data !== "object") return null;
	const row = data as Record<string, unknown>;
	if (row.status !== "ok") return null;
	const streak = asNumber(row.streak);
	const best = asNumber(row.best);
	const nextStreak = asNumber(row.next_streak);
	const nextReward = asNumber(row.next_reward);
	if (streak === null || best === null || nextStreak === null || nextReward === null) return null;
	return { streak, best, claimedToday: row.claimed_today === true, nextStreak, nextReward, nextChest: asChestSize(row.next_chest), calendar: parseCalendar(row.calendar) };
}

export function parseDailyRewardClaim(data: unknown): { state: "claimed" | "already"; claim: DailyRewardClaim } | null {
	if (!data || typeof data !== "object") return null;
	const row = data as Record<string, unknown>;
	if (row.status !== "claimed" && row.status !== "already") return null;
	const streak = asNumber(row.streak);
	const best = asNumber(row.best);
	const nextReward = asNumber(row.next_reward);
	if (streak === null || best === null || nextReward === null) return null;
	return {
		state: row.status,
		claim: {
			streak,
			reward: asNumber(row.reward) ?? 0,
			best,
			coins: asNumber(row.coins),
			nextReward,
			chest: parseChest(row.chest),
			ownedItemIds: Array.isArray(row.owned_item_ids) ? row.owned_item_ids.filter((id): id is string => typeof id === "string") : null,
		},
	};
}

/** Null for guests and when the server cannot be reached. */
export async function fetchDailyRewardStatus(): Promise<DailyRewardStatus | null> {
	try {
		const { data: { session } } = await getAccountSession();
		if (!session?.user) return null;
		const { data, error } = await supabase.rpc("daily_reward_status");
		if (error) return null;
		const status = parseDailyRewardStatus(data);
		if (status) noteStreakBest(status.best);
		return status;
	} catch {
		return null;
	}
}

/** Null when the claim must be retried (no account, offline, no profile yet). */
export async function claimDailyReward(): Promise<{ state: "claimed" | "already"; claim: DailyRewardClaim } | null> {
	try {
		const { data: { session } } = await getAccountSession();
		if (!session?.user) return null;
		const { data, error } = await supabase.rpc("claim_daily_reward");
		if (error) return null;
		const claim = parseDailyRewardClaim(data);
		if (claim) noteStreakBest(claim.claim.best);
		return claim;
	} catch {
		return null;
	}
}
