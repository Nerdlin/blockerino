import { useCallback, useEffect, useState } from "react";
import { supabase } from "./Supabase";
import { getAccountSession } from "./AccountSession";

// The monthly quest: the daily bonus (all three daily quests) on 10 and on 20 different days of a month. Every step is
// claimed on its own; the second one also gives that month's medal. The server counts the days and pays
// (monthly_milestones migration); the table below is mirrored there and a jest test compares both.

export interface MonthlyMilestoneDef {
	days: number;
	coins: number;
	keys: number;
	/** The step that gives the month's medal. */
	medal: boolean;
}

export const MONTHLY_MILESTONES: MonthlyMilestoneDef[] = [
	{ days: 10, coins: 500, keys: 2, medal: false },
	{ days: 20, coins: 1500, keys: 4, medal: true },
];

export interface MonthlyMilestone extends MonthlyMilestoneDef {
	/** 1-based, as the server numbers them. */
	index: number;
	claimed: boolean;
}

export interface MonthlyQuestState {
	month: string;
	endsAt: string;
	/** Days with the daily bonus so far. */
	done: number;
	milestones: MonthlyMilestone[];
	/** Months whose medal was collected, newest first ("2026-11"). */
	medals: string[];
}

export type MonthlyClaimStatus = "ok" | "already" | "locked" | "guest" | "unauthenticated" | "no_profile" | "bad_milestone" | "failed";

export interface MonthlyClaimResult {
	status: MonthlyClaimStatus;
	state: MonthlyQuestState | null;
	milestone: number | null;
	medal: boolean;
	coins: number;
	keys: number;
	wallet: number | null;
}

function parseMilestones(value: unknown): MonthlyMilestone[] {
	const rows = Array.isArray(value) ? value : [];
	const fromServer = rows.flatMap((entry) => {
		if (!entry || typeof entry !== "object") return [];
		const row = entry as Record<string, unknown>;
		const index = typeof row.i === "number" ? row.i : NaN;
		const days = typeof row.days === "number" ? row.days : NaN;
		const coins = typeof row.coins === "number" ? row.coins : NaN;
		const keys = typeof row.keys === "number" ? row.keys : NaN;
		if (![index, days, coins, keys].every((n) => Number.isFinite(n) && n >= 0)) return [];
		return [{ index, days, coins, keys, medal: row.medal === true, claimed: row.claimed === true }];
	});
	if (fromServer.length > 0) return fromServer.sort((a, b) => a.days - b.days);
	return MONTHLY_MILESTONES.map((step, i) => ({ ...step, index: i + 1, claimed: false }));
}

export function parseMonthlyQuest(data: unknown): MonthlyQuestState | null {
	if (!data || typeof data !== "object") return null;
	const raw = data as Record<string, unknown>;
	if (typeof raw.month !== "string" || !/^\d{4}-\d{2}$/.test(raw.month)) return null;
	return {
		month: raw.month,
		endsAt: typeof raw.ends_at === "string" ? raw.ends_at : "",
		done: typeof raw.done === "number" && Number.isFinite(raw.done) && raw.done >= 0 ? raw.done : 0,
		milestones: parseMilestones(raw.milestones),
		medals: Array.isArray(raw.medals) ? raw.medals.filter((m): m is string => typeof m === "string" && /^\d{4}-\d{2}$/.test(m)) : [],
	};
}

/** Days with the bonus the last step needs: the full length of the progress bar. */
export function monthlyGoal(state: Pick<MonthlyQuestState, "milestones">): number {
	return Math.max(1, ...state.milestones.map((step) => step.days));
}

/** Steps that are reached but not taken yet. */
export function claimableMilestones(state: Pick<MonthlyQuestState, "done" | "milestones">): MonthlyMilestone[] {
	return state.milestones.filter((step) => !step.claimed && state.done >= step.days);
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

export async function claimMonthlyQuest(milestone?: number): Promise<MonthlyClaimResult> {
	const failed: MonthlyClaimResult = { status: "failed", state: null, milestone: null, medal: false, coins: 0, keys: 0, wallet: null };
	try {
		const { data, error } = await supabase.rpc("claim_monthly_quest", milestone === undefined ? {} : { p_milestone: milestone });
		if (error || !data || typeof data !== "object") return failed;
		const raw = data as Record<string, unknown>;
		return {
			status: typeof raw.status === "string" ? (raw.status as MonthlyClaimStatus) : "failed",
			state: parseMonthlyQuest(data),
			milestone: typeof raw.milestone === "number" ? raw.milestone : null,
			medal: raw.medal === true,
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
