import { atom } from "jotai";
import { noteStreakBest } from "./Achievements";
import { supabase } from "./Supabase";

// Daily login streak. The server owns the streak and pays the coins (daily_streak migration); this file
// only asks it and shows the answer. Signed-in players only: guests have no server profile.

export interface DailyRewardStatus {
	/** Current streak; 0 when it was broken or never started. */
	streak: number;
	best: number;
	claimedToday: boolean;
	/** The streak day today's claim (or tomorrow's) would reach. */
	nextStreak: number;
	/** Coins for that day. */
	nextReward: number;
}

export interface DailyRewardClaim {
	streak: number;
	reward: number;
	best: number;
	/** The wallet balance the server answers with. */
	coins: number | null;
	/** Coins for the day after this one. */
	nextReward: number;
}

export const dailyRewardStatusAtom = atom<DailyRewardStatus | null>(null);
/** The menu chip asks the host to open the popup. */
export const dailyRewardOpenAtom = atom(false);

function asNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
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
	return { streak, best, claimedToday: row.claimed_today === true, nextStreak, nextReward };
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
		claim: { streak, reward: asNumber(row.reward) ?? 0, best, coins: asNumber(row.coins), nextReward },
	};
}

/** Null for guests and when the server cannot be reached. */
export async function fetchDailyRewardStatus(): Promise<DailyRewardStatus | null> {
	try {
		const { data: { session } } = await supabase.auth.getSession();
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
		const { data: { session } } = await supabase.auth.getSession();
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
