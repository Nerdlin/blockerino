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

/** `days: 0` is every day of the month (28 to 31, the server counts it). */
export const MONTHLY_MILESTONES: MonthlyMilestoneDef[] = [
	{ days: 10, coins: 500, keys: 2, medal: false },
	{ days: 20, coins: 1500, keys: 4, medal: true },
	{ days: 0, coins: 2500, keys: 6, medal: false },
];

/** Days in a "2026-11" month. */
export function daysInMonthKey(month: string): number {
	const match = /^(\d{4})-(\d{2})$/.exec(month);
	if (!match) return 30;
	return new Date(Number(match[1]), Number(match[2]), 0).getDate();
}

/** The look of the monthly card: it changes with the month, to suit the season. */
export interface MonthTheme {
	/** Gradient from the light corner through the middle to the dark one. */
	from: string;
	via: string;
	to: string;
	/** The thick lower edge. */
	edge: string;
	/** Frames of the medals and the highlight text. */
	accent: string;
	/** What drifts over the card. */
	particles: "snow" | "leaf" | "petal" | "heart" | "spark" | "ember" | "pollen";
	particleColors: string[];
}

const THEMES: MonthTheme[] = [
	// January: the new year, fireworks over violet
	{ from: "#E879F9", via: "#8B5CF6", to: "#3B0764", edge: "#2E1065", accent: "#F0ABFC", particles: "spark", particleColors: ["#FDE047", "#FFFFFF", "#F0ABFC"] },
	// February: love
	{ from: "#FDA4AF", via: "#F43F5E", to: "#881337", edge: "#6B0F2A", accent: "#FDA4AF", particles: "heart", particleColors: ["#FFE4E6", "#FDA4AF", "#FFFFFF"] },
	// March: the first spring green
	{ from: "#BEF264", via: "#22C55E", to: "#14532D", edge: "#0F3D21", accent: "#BEF264", particles: "petal", particleColors: ["#ECFCCB", "#BEF264", "#FFFFFF"] },
	// April: blossom
	{ from: "#F9A8D4", via: "#EC4899", to: "#831843", edge: "#640F34", accent: "#F9A8D4", particles: "petal", particleColors: ["#FFFFFF", "#FBCFE8", "#F9A8D4"] },
	// May: pollen and young leaves
	{ from: "#FDE047", via: "#84CC16", to: "#365314", edge: "#273B0E", accent: "#FDE047", particles: "pollen", particleColors: ["#FEF9C3", "#FDE047", "#FFFFFF"] },
	// June: the sun
	{ from: "#FDE047", via: "#F59E0B", to: "#B45309", edge: "#8A3F07", accent: "#FDE047", particles: "spark", particleColors: ["#FFFFFF", "#FEF08A", "#FDE047"] },
	// July: a hot sunset
	{ from: "#F0ABFC", via: "#D946EF", to: "#F97316", edge: "#B3380D", accent: "#FDBA74", particles: "spark", particleColors: ["#FFFFFF", "#FDBA74", "#F0ABFC"] },
	// August: late summer gold
	{ from: "#FCD34D", via: "#FB923C", to: "#BE123C", edge: "#8E0F2D", accent: "#FCD34D", particles: "pollen", particleColors: ["#FEF3C7", "#FCD34D", "#FFFFFF"] },
	// September: the first leaves
	{ from: "#FDBA74", via: "#D97706", to: "#78350F", edge: "#5A2A0B", accent: "#FDBA74", particles: "leaf", particleColors: ["#FDBA74", "#F59E0B", "#B45309"] },
	// October: pumpkin and a purple night
	{ from: "#FB923C", via: "#7C3AED", to: "#1E1B4B", edge: "#16143A", accent: "#FDBA74", particles: "leaf", particleColors: ["#FB923C", "#FDBA74", "#A78BFA"] },
	// November: embers and falling leaves, the fire of the streak
	{ from: "#FBBF24", via: "#F97316", to: "#EF4444", edge: "#B91C1C", accent: "#FBBF24", particles: "ember", particleColors: ["#FEF08A", "#FDBA74", "#FFFFFF"] },
	// December: snow and the new year, red and green
	{ from: "#EF4444", via: "#B91C1C", to: "#14532D", edge: "#0F3D21", accent: "#FCA5A5", particles: "snow", particleColors: ["#FFFFFF", "#E2E8F0", "#FFFFFF"] },
];

/** The theme of a "2026-11" month (the fire for anything unreadable). */
export function monthTheme(month: string): MonthTheme {
	const match = /^\d{4}-(\d{2})$/.exec(month);
	const index = match ? Number(match[1]) - 1 : 10;
	return THEMES[index >= 0 && index < 12 ? index : 10];
}

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

function parseMilestones(value: unknown, month: string): MonthlyMilestone[] {
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
	return MONTHLY_MILESTONES.map((step, i) => ({ ...step, days: step.days || daysInMonthKey(month), index: i + 1, claimed: false }));
}

export function parseMonthlyQuest(data: unknown): MonthlyQuestState | null {
	if (!data || typeof data !== "object") return null;
	const raw = data as Record<string, unknown>;
	if (typeof raw.month !== "string" || !/^\d{4}-\d{2}$/.test(raw.month)) return null;
	return {
		month: raw.month,
		endsAt: typeof raw.ends_at === "string" ? raw.ends_at : "",
		done: typeof raw.done === "number" && Number.isFinite(raw.done) && raw.done >= 0 ? raw.done : 0,
		milestones: parseMilestones(raw.milestones, raw.month),
		medals: Array.isArray(raw.medals) ? raw.medals.filter((m): m is string => typeof m === "string" && /^\d{4}-\d{2}$/.test(m)) : [],
	};
}

/** Days with the bonus the last step needs: the full length of the progress bar. */
export function monthlyGoal(state: Pick<MonthlyQuestState, "milestones">): number {
	return Math.max(1, ...state.milestones.map((step) => step.days));
}

/** The step that needs every day of the month. */
export function isFullMonthStep(step: Pick<MonthlyMilestone, "days">, month: string): boolean {
	return step.days >= daysInMonthKey(month);
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
