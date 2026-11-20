import { useCallback, useEffect, useState } from "react";
import { supabase } from "./Supabase";
import { getAccountSession } from "./AccountSession";

// The monthly quest: the daily bonus (all three daily quests) on 10 different days of a month earns that month's medal,
// 600 coins and 2 chest keys. The server counts the days and pays (monthly_quest migration); the target and the reward
// below are mirrored there and a jest test compares both.

export const MONTHLY_TARGET = 10;
export const MONTHLY_REWARD = 600;
export const MONTHLY_KEYS = 2;

export interface MonthlyQuestState {
	month: string;
	endsAt: string;
	target: number;
	reward: number;
	done: number;
	claimed: boolean;
	/** Months whose medal was collected, newest first ("2026-11"). */
	medals: string[];
}

export type MonthlyClaimStatus = "ok" | "already" | "locked" | "guest" | "unauthenticated" | "no_profile" | "failed";

export interface MonthlyClaimResult {
	status: MonthlyClaimStatus;
	state: MonthlyQuestState | null;
	coins: number;
	keys: number;
	wallet: number | null;
}

export function parseMonthlyQuest(data: unknown): MonthlyQuestState | null {
	if (!data || typeof data !== "object") return null;
	const raw = data as Record<string, unknown>;
	if (typeof raw.month !== "string" || !/^\d{4}-\d{2}$/.test(raw.month)) return null;
	const number = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback);
	return {
		month: raw.month,
		endsAt: typeof raw.ends_at === "string" ? raw.ends_at : "",
		target: Math.max(1, number(raw.target, MONTHLY_TARGET)),
		reward: number(raw.reward, MONTHLY_REWARD),
		done: number(raw.done, 0),
		claimed: raw.claimed === true,
		medals: Array.isArray(raw.medals) ? raw.medals.filter((m): m is string => typeof m === "string" && /^\d{4}-\d{2}$/.test(m)) : [],
	};
}

/** Whole days until the month ends (at least 0). */
export function daysLeftInMonth(state: Pick<MonthlyQuestState, "endsAt">, now: Date = new Date()): number {
	const end = Date.parse(state.endsAt);
	if (!Number.isFinite(end)) return 0;
	return Math.max(0, Math.ceil((end - now.getTime()) / 86_400_000));
}

export async function fetchMonthlyQuest(): Promise<MonthlyQuestState | null> {
	try {
		const { data: { session } } = await getAccountSession();
		if (!session?.user) return null;
		const { data, error } = await supabase.rpc("get_monthly_quest");
		if (error) return null;
		return parseMonthlyQuest(data);
	} catch {
		return null;
	}
}

export async function claimMonthlyQuest(): Promise<MonthlyClaimResult> {
	const failed: MonthlyClaimResult = { status: "failed", state: null, coins: 0, keys: 0, wallet: null };
	try {
		const { data, error } = await supabase.rpc("claim_monthly_quest");
		if (error || !data || typeof data !== "object") return failed;
		const raw = data as Record<string, unknown>;
		const status = typeof raw.status === "string" ? (raw.status as MonthlyClaimStatus) : "failed";
		return {
			status,
			state: parseMonthlyQuest(data),
			coins: typeof raw.coins === "number" ? raw.coins : 0,
			keys: typeof raw.keys === "number" ? raw.keys : 0,
			wallet: typeof raw.wallet === "number" ? raw.wallet : null,
		};
	} catch {
		return failed;
	}
}

export function useMonthlyQuest(): { state: MonthlyQuestState | null; refresh: () => Promise<void>; set: (next: MonthlyQuestState | null) => void } {
	const [state, setState] = useState<MonthlyQuestState | null>(null);
	const refresh = useCallback(async () => {
		setState(await fetchMonthlyQuest());
	}, []);
	useEffect(() => {
		let active = true;
		void fetchMonthlyQuest().then((next) => {
			if (active) setState(next);
		});
		return () => {
			active = false;
		};
	}, []);
	return { state, refresh, set: setState };
}
