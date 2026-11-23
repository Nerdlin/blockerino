import AsyncStorage from "@react-native-async-storage/async-storage";
import { atom, useAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { supabase } from "./Supabase";
import { getAccountSession } from "./AccountSession";
import { parseChest, type ChestPrize, type ChestSize } from "./DailyReward";
import { parseChestState, publishChestState, type ChestState } from "./Chests";
import { getSeasonEndsAt } from "./SeasonScores";
import { subscribeToOutcomes, type GameOutcome } from "./GameStats";
import { onQuestsClaimed } from "./DailyQuests";
import { isOnline } from "./NetworkStatus";
import { loadLastKnown, saveLastKnown } from "./LastKnown";

/** The pass as last saved for this player (shown, marked with its age, while there is no network). */
export async function loadSavedSeasonPass(): Promise<{ state: SeasonPassState; savedAt: number } | null> {
	try {
		const { data: { session } } = await getAccountSession();
		if (!session?.user) return null;
		const saved = await loadLastKnown<SeasonPassState>(`pass:${session.user.id}`);
		return saved ? { state: saved.value, savedAt: saved.savedAt } : null;
	} catch {
		return null;
	}
}

// The free season pass: 30 tiers for every leaderboard season (a UTC month, the same key and end the leaderboards use).
// XP comes from play; the server owns it (supabase/migrations/20261118130000_season_pass.sql) and so does every
// reward, so this file only mirrors the tables for drawing (a jest test compares them with the migration), keeps a
// small queue of reported games for when the phone is offline, and asks. Signed-in players only: a guest earns nothing.

export const TIER_COUNT = 30;
/** The most XP one UTC day can give, over every source. */
export const DAILY_XP_CAP = 350;

/** Cumulative XP that tier n needs (5n^2 + 145n: 150 for the first tier, 440 for the last). */
export function tierXp(tier: number): number {
	return tier <= 0 ? 0 : 5 * tier * tier + 145 * tier;
}

/** XP a tier costs on top of the one before it. */
export function tierCost(tier: number): number {
	return tierXp(tier) - tierXp(tier - 1);
}

/** The tier an XP total has reached, 0 to 30. */
export function tierForXp(xp: number): number {
	let tier = 0;
	while (tier < TIER_COUNT && tierXp(tier + 1) <= xp) tier++;
	return tier;
}

export interface TierProgress {
	tier: number;
	/** XP into the tier being worked on. */
	into: number;
	/** XP that tier needs; 0 when the pass is complete. */
	needed: number;
	/** 0 to 1. */
	fraction: number;
}

export function tierProgress(xp: number): TierProgress {
	const tier = tierForXp(xp);
	if (tier >= TIER_COUNT) return { tier, into: 0, needed: 0, fraction: 1 };
	const into = Math.max(0, xp - tierXp(tier));
	const needed = tierCost(tier + 1);
	return { tier, into, needed, fraction: Math.min(1, into / needed) };
}

// ---- sources -------------------------------------------------------------------------------------------------------

/** What the phone reports (the server cannot see a solo game, so it only trusts the daily limits). */
export type ReportedSource = "classic" | "chaos" | "challenge" | "level" | "more_win" | "more_play";
/** What the server counts itself, from its own tables. */
export type VerifiedSource = "versus" | "quest_task" | "quest_bonus";
export type XpSource = ReportedSource | VerifiedSource;

export interface SourceRule {
	/** XP of one event. */
	xp: number;
	/** Events that count in one UTC day. */
	max: number;
}

export const SOURCE_RULES: Record<XpSource, SourceRule> = {
	classic: { xp: 20, max: 5 },
	chaos: { xp: 20, max: 5 },
	challenge: { xp: 15, max: 4 },
	level: { xp: 10, max: 5 },
	more_win: { xp: 20, max: 4 },
	more_play: { xp: 8, max: 4 },
	versus: { xp: 40, max: 5 },
	quest_task: { xp: 15, max: 3 },
	quest_bonus: { xp: 30, max: 1 },
};

export const REPORTED_SOURCES: ReportedSource[] = ["classic", "chaos", "challenge", "level", "more_win", "more_play"];
/** The server takes one report per source in this many seconds. */
export const MIN_GAP_SECONDS = 30;

/** What a game must have been to count: a score and a time (the level map and nothing else counts without either). */
export interface MinimumPlay {
	score?: number;
	seconds: number;
}

export const MINIMUM_PLAY: Partial<Record<ReportedSource, MinimumPlay>> = {
	classic: { score: 300, seconds: 60 },
	chaos: { score: 300, seconds: 60 },
	challenge: { score: 100, seconds: 45 },
	more_win: { seconds: 30 },
	more_play: { seconds: 30 },
};

export interface PlayStats {
	score?: number;
	/** How long the game lasted; null or missing when the game cannot say (such a game does not count). */
	durationMs?: number | null;
}

/** Whether a finished game was long and good enough to earn XP. The level map has no minimum: a first clear is a clear. */
export function meetsMinimum(source: ReportedSource, stats: PlayStats = {}): boolean {
	const rule = MINIMUM_PLAY[source];
	if (!rule) return true;
	if (rule.score !== undefined && !((stats.score ?? 0) >= rule.score)) return false;
	return typeof stats.durationMs === "number" && stats.durationMs >= rule.seconds * 1000;
}

/** The source a finished solo game belongs to; null for modes without XP (the level map). */
export function sourceForGameMode(gameMode: string): ReportedSource | null {
	switch (gameMode) {
		case "classic":
			return "classic";
		case "chaos":
			return "chaos";
		case "daily_puzzle":
		case "time_attack":
		case "move_limit":
		case "rescue":
		case "combo_trial":
			return "challenge";
		default:
			return null;
	}
}

/** A finished More Games match: a win pays more than a loss or a draw. Versus is counted by the server, not reported. */
export function sourceForOutcome(gameId: string, outcome: GameOutcome): ReportedSource | null {
	if (gameId === "versus") return null;
	return outcome === "win" ? "more_win" : "more_play";
}

/** What was counted on one UTC day: events per source and the XP they gave. */
export interface DayLedger {
	day: string;
	events: Partial<Record<XpSource, number>>;
	xp: number;
}

export function emptyLedger(day: string): DayLedger {
	return { day, events: {}, xp: 0 };
}

export function utcDay(now: Date = new Date()): string {
	return now.toISOString().slice(0, 10);
}

/** The XP an event count of a source is worth against a ledger, before the day cap. */
export function eventsLeft(ledger: DayLedger, source: XpSource): number {
	return Math.max(0, SOURCE_RULES[source].max - (ledger.events[source] ?? 0));
}

/**
 * Counts events of a source against a day, the way the server does: each source has a limit of events and the day has
 * a limit of XP. Returns the new ledger and the XP given (never mutates).
 */
export function creditEvents(ledger: DayLedger, source: XpSource, count: number): { ledger: DayLedger; xp: number; counted: number } {
	const rule = SOURCE_RULES[source];
	const counted = Math.min(Math.max(0, Math.floor(count)), eventsLeft(ledger, source));
	if (counted < 1) return { ledger, xp: 0, counted: 0 };
	const xp = Math.max(0, Math.min(counted * rule.xp, DAILY_XP_CAP - ledger.xp));
	return {
		ledger: { day: ledger.day, events: { ...ledger.events, [source]: (ledger.events[source] ?? 0) + counted }, xp: ledger.xp + xp },
		xp,
		counted,
	};
}

/** Days of playing at the daily XP limit that a whole pass takes. */
export function daysToFinishAtCap(): number {
	return Math.ceil(tierXp(TIER_COUNT) / DAILY_XP_CAP);
}

// ---- rewards -------------------------------------------------------------------------------------------------------

export interface TierReward {
	tier: number;
	coins: number;
	keys: number;
	chest: ChestSize | null;
	/** The tier hands out the season's cosmetic (see SEASON_COSMETICS). */
	cosmetic: boolean;
}

function reward(tier: number, parts: Partial<Omit<TierReward, "tier">>): TierReward {
	return { tier, coins: 0, keys: 0, chest: null, cosmetic: false, ...parts };
}

/** Mirrors public.season_pass_reward() (a jest test compares them). */
export const TIER_REWARDS: TierReward[] = [
	reward(1, { coins: 25 }),
	reward(2, { keys: 1 }),
	reward(3, { coins: 25 }),
	reward(4, { coins: 30 }),
	reward(5, { chest: "small" }),
	reward(6, { coins: 30 }),
	reward(7, { keys: 1 }),
	reward(8, { coins: 35 }),
	reward(9, { coins: 35 }),
	reward(10, { cosmetic: true }),
	reward(11, { coins: 40 }),
	reward(12, { coins: 40 }),
	reward(13, { keys: 1 }),
	reward(14, { coins: 45 }),
	reward(15, { coins: 45 }),
	reward(16, { coins: 50 }),
	reward(17, { coins: 50 }),
	reward(18, { cosmetic: true }),
	reward(19, { coins: 55 }),
	reward(20, { chest: "small" }),
	reward(21, { keys: 1 }),
	reward(22, { coins: 60 }),
	reward(23, { coins: 60 }),
	reward(24, { coins: 65 }),
	reward(25, { cosmetic: true }),
	reward(26, { coins: 70 }),
	reward(27, { keys: 1 }),
	reward(28, { coins: 75 }),
	reward(29, { coins: 80 }),
	reward(30, { coins: 100, chest: "big", cosmetic: true }),
];

/** Coins a cosmetic tier pays when its season has no set, or the player owns the skin already (season_pass_cosmetic_coins). */
export const COSMETIC_FALLBACK_COINS: Record<number, number> = { 10: 100, 18: 150, 25: 200, 30: 300 };

// ---- premium track ---------------------------------------------------------------------------------------------------

/** Coins that open the premium track of a season (season_pass_premium_price). */
export const PREMIUM_PRICE = 2000;

const premiumReward = reward;
/** Mirrors public.season_pass_premium_reward() (a jest test compares them). */
export const PREMIUM_REWARDS: TierReward[] = [
	premiumReward(1, { coins: 30 }),
	premiumReward(2, { keys: 1 }),
	premiumReward(3, { coins: 30 }),
	premiumReward(4, { coins: 40 }),
	premiumReward(5, { chest: "small" }),
	premiumReward(6, { coins: 40 }),
	premiumReward(7, { coins: 50 }),
	premiumReward(8, { cosmetic: true }),
	premiumReward(9, { coins: 50 }),
	premiumReward(10, { coins: 50 }),
	premiumReward(11, { coins: 60 }),
	premiumReward(12, { keys: 1 }),
	premiumReward(13, { coins: 60 }),
	premiumReward(14, { coins: 60 }),
	premiumReward(15, { chest: "small" }),
	premiumReward(16, { cosmetic: true }),
	premiumReward(17, { coins: 70 }),
	premiumReward(18, { coins: 70 }),
	premiumReward(19, { coins: 80 }),
	premiumReward(20, { coins: 80 }),
	premiumReward(21, { coins: 80 }),
	premiumReward(22, { coins: 90 }),
	premiumReward(23, { keys: 1 }),
	premiumReward(24, { cosmetic: true }),
	premiumReward(25, { coins: 100 }),
	premiumReward(26, { coins: 100 }),
	premiumReward(27, { coins: 110 }),
	premiumReward(28, { coins: 120 }),
	premiumReward(29, { coins: 120 }),
	premiumReward(30, { coins: 150, chest: "big", cosmetic: true }),
];

/** Coins a premium skin tier pays when the skin is owned already (season_pass_premium_cosmetic_coins). */
export const PREMIUM_COSMETIC_COINS: Record<number, number> = { 8: 100, 16: 150, 24: 200, 30: 300 };

export type SeasonCosmetics = Record<number, string>;

/**
 * The exclusive skins of each season's premium track (blocks at 8 and 24, backgrounds at 16 and 30). Mirrors the
 * migration's season_pass_premium_cosmetics. A season missing here has no premium track yet.
 */
export const SEASON_PREMIUM_COSMETICS: Record<string, SeasonCosmetics> = {
	"2026-11": { 8: "piece_premium_emberleaf", 16: "background_premium_leaffall", 24: "piece_premium_harvestmoon", 30: "background_premium_harvestnight" },
	"2026-12": { 8: "piece_premium_snowglass", 16: "background_premium_northern", 24: "piece_premium_goldholly", 30: "background_premium_starfall" },
};

/**
 * The skins each season hands out, by tier (blocks at 10 and 25, backgrounds at 18 and 30). Mirrors the migration's
 * season_pass_cosmetics; a new season adds its four here and in a migration. A season missing here pays coins.
 */
export const SEASON_COSMETICS: Record<string, SeasonCosmetics> = {
	"2026-11": { 10: "piece_season_dawn", 18: "background_season_horizon", 25: "piece_season_nova", 30: "background_season_zenith" },
	"2026-12": { 10: "piece_season_snowfall", 18: "background_season_frostlake", 25: "piece_season_garland", 30: "background_season_midwinter" },
	"2027-01": { 10: "piece_season_confetti", 18: "background_season_countdown", 25: "piece_season_sparkler", 30: "background_season_newyear" },
	"2027-02": { 10: "piece_season_heartbeat", 18: "background_season_rosedusk", 25: "piece_season_quartz", 30: "background_season_blizzard" },
};

/** The server's list for the season when it has answered, else the device's own copy. */
export function cosmeticsForSeason(season: string, fromServer?: SeasonCosmetics | null): SeasonCosmetics {
	return fromServer ?? SEASON_COSMETICS[season] ?? {};
}

export interface ResolvedReward {
	tier: number;
	coins: number;
	keys: number;
	chest: ChestSize | null;
	/** The season's skin at this tier; null for a tier without one (or a season without a set). */
	itemId: string | null;
}

/** What a tier pays in a season: a cosmetic tier without a skin pays coins instead. */
export function resolveReward(entry: TierReward, cosmetics: SeasonCosmetics, fallback: Record<number, number> = COSMETIC_FALLBACK_COINS): ResolvedReward {
	const itemId = entry.cosmetic ? cosmetics[entry.tier] ?? null : null;
	const coins = entry.coins + (entry.cosmetic && !itemId ? fallback[entry.tier] ?? 0 : 0);
	return { tier: entry.tier, coins, keys: entry.keys, chest: entry.chest, itemId };
}

export function getTierReward(tier: number): TierReward | undefined {
	return TIER_REWARDS[tier - 1];
}

export interface RewardTotals {
	coins: number;
	keys: number;
	smallChests: number;
	bigChests: number;
	items: number;
}

/** What a whole pass pays in a season with the given cosmetics. */
export function totalRewards(cosmetics: SeasonCosmetics = SEASON_COSMETICS["2026-11"]): RewardTotals {
	return TIER_REWARDS.map((entry) => resolveReward(entry, cosmetics)).reduce<RewardTotals>(
		(sum, entry) => ({
			coins: sum.coins + entry.coins,
			keys: sum.keys + entry.keys,
			smallChests: sum.smallChests + (entry.chest === "small" ? 1 : 0),
			bigChests: sum.bigChests + (entry.chest === "big" ? 1 : 0),
			items: sum.items + (entry.itemId ? 1 : 0),
		}),
		{ coins: 0, keys: 0, smallChests: 0, bigChests: 0, items: 0 },
	);
}

/** A pass valued in coins, a chest at its shop price (a key opens a small one): the number the economy is kept to. */
export function rewardValue(totals: RewardTotals): number {
	return totals.coins + (totals.keys + totals.smallChests) * 400 + totals.bigChests * 1000;
}

// ---- state ---------------------------------------------------------------------------------------------------------

export interface SeasonPassState {
	season: string;
	endsAt: number;
	xp: number;
	tier: number;
	claimed: number[];
	todayXp: number;
	dailyCap: number;
	/** The season's skins by tier, as the server holds them. */
	cosmetics: SeasonCosmetics;
	premium: PremiumState;
}

export interface PremiumState {
	/** The season has a premium track (a set of exclusive skins). */
	available: boolean;
	unlocked: boolean;
	price: number;
	claimed: number[];
	cosmetics: SeasonCosmetics;
}

function parsePremium(value: unknown): PremiumState {
	const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
	return {
		available: row.available === true,
		unlocked: row.unlocked === true,
		price: Math.max(1, Math.floor(num(row.price) ?? PREMIUM_PRICE)),
		claimed: Array.isArray(row.claimed) ? row.claimed.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= TIER_COUNT) : [],
		cosmetics: parseCosmetics(row.cosmetics),
	};
}

function parseCosmetics(value: unknown): SeasonCosmetics {
	const result: SeasonCosmetics = {};
	if (!value || typeof value !== "object" || Array.isArray(value)) return result;
	for (const [key, id] of Object.entries(value as Record<string, unknown>)) {
		const tier = Number(key);
		if (Number.isInteger(tier) && tier >= 1 && tier <= TIER_COUNT && typeof id === "string" && id.length > 0) result[tier] = id;
	}
	return result;
}

function num(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseSeasonPassState(data: unknown): SeasonPassState | null {
	if (!data || typeof data !== "object") return null;
	const row = data as Record<string, unknown>;
	// a claim answers with the pass too (status ok, locked or already)
	if (row.status !== "ok" && row.status !== "locked" && row.status !== "already") return null;
	const xp = num(row.xp);
	const tier = num(row.tier);
	const endsAt = typeof row.ends_at === "string" ? Date.parse(row.ends_at) : NaN;
	if (xp === null || tier === null || typeof row.season !== "string") return null;
	return {
		season: row.season,
		endsAt: Number.isFinite(endsAt) ? endsAt : getSeasonEndsAt().getTime(),
		xp: Math.max(0, Math.floor(xp)),
		tier: Math.max(0, Math.min(TIER_COUNT, Math.floor(tier))),
		claimed: Array.isArray(row.claimed) ? row.claimed.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= TIER_COUNT) : [],
		todayXp: Math.max(0, Math.floor(num(row.today_xp) ?? 0)),
		dailyCap: Math.max(1, Math.floor(num(row.daily_cap) ?? DAILY_XP_CAP)),
		cosmetics: row.cosmetics === undefined ? cosmeticsForSeason(row.season) : parseCosmetics(row.cosmetics),
		premium: parsePremium(row.premium),
	};
}

/** Tiers reached and not claimed yet, lowest first. */
export function claimableTiers(state: Pick<SeasonPassState, "tier" | "claimed"> | null): number[] {
	if (!state) return [];
	const claimed = new Set(state.claimed);
	return Array.from({ length: Math.min(state.tier, TIER_COUNT) }, (_, i) => i + 1).filter((tier) => !claimed.has(tier));
}

/** Premium tiers reached and not claimed yet; none while the premium track is closed. */
export function claimablePremiumTiers(state: Pick<SeasonPassState, "tier" | "premium"> | null): number[] {
	if (!state || !state.premium.unlocked) return [];
	const claimed = new Set(state.premium.claimed);
	return Array.from({ length: Math.min(state.tier, TIER_COUNT) }, (_, i) => i + 1).filter((tier) => !claimed.has(tier));
}

/** The next tier with something worth looking at, for a "next reward" hint; null when the pass is done. */
export function nextRewardTier(state: Pick<SeasonPassState, "tier"> | null): number | null {
	const tier = (state?.tier ?? 0) + 1;
	return tier <= TIER_COUNT ? tier : null;
}

/** Whole milliseconds left of the season, from the server's end (or the leaderboard's own calendar). */
export function seasonTimeLeft(state: Pick<SeasonPassState, "endsAt"> | null, now: Date = new Date()): { days: number; hours: number; ms: number } {
	const end = state?.endsAt ?? getSeasonEndsAt(now).getTime();
	const ms = Math.max(0, end - now.getTime());
	return { days: Math.floor(ms / 86_400_000), hours: Math.floor((ms % 86_400_000) / 3_600_000), ms };
}

export const seasonPassAtom = atom<SeasonPassState | null>(null);

const listeners = new Set<(state: SeasonPassState | null) => void>();
/** Every answer that carries the pass updates every screen that shows it (the menu dot, the pass screen). */
export function publishSeasonPass(state: SeasonPassState | null): void {
	listeners.forEach((listener) => listener(state));
}

export function useSeasonPass(): { pass: SeasonPassState | null; refresh: () => Promise<SeasonPassState | null> } {
	const [pass, setPass] = useAtom(seasonPassAtom);
	useEffect(() => {
		listeners.add(setPass);
		return () => {
			listeners.delete(setPass);
		};
	}, [setPass]);
	const refresh = useCallback(() => syncSeasonPass(), []);
	return { pass, refresh };
}

// ---- server --------------------------------------------------------------------------------------------------------

/** The pass with the XP the server can verify counted in. Null for guests and when the server cannot be reached. */
export async function syncSeasonPass(): Promise<SeasonPassState | null> {
	try {
		const { data: { session } } = await getAccountSession();
		if (!session?.user) {
			publishSeasonPass(null);
			return null;
		}
		if (!(await isOnline())) return null;
		const { data, error } = await supabase.rpc("season_pass_sync");
		if (error) return null;
		const state = parseSeasonPassState(data);
		if (state) {
			publishSeasonPass(state);
			void saveLastKnown(`pass:${session.user.id}`, state);
		}
		return state;
	} catch {
		return null;
	}
}

export interface TierClaim {
	tier: number;
	coins: number;
	keys: number;
	chest: ChestPrize | null;
	itemId: string | null;
	/** The cosmetic was owned already: `coins` includes the replacement. */
	duplicate: boolean;
	/** The balance now. */
	wallet: number | null;
	ownedItemIds: string[];
	chestState: ChestState | null;
	pass: SeasonPassState | null;
}

export type TierClaimResult =
	| { status: "ok"; claim: TierClaim }
	| { status: "locked" | "already" | "guest" | "failed" | "not_premium" };

export function parseTierClaim(data: unknown): TierClaimResult {
	if (!data || typeof data !== "object") return { status: "failed" };
	const row = data as Record<string, unknown>;
	if (row.status === "locked" || row.status === "already" || row.status === "not_premium") return { status: row.status };
	if (row.status === "guest" || row.status === "unauthenticated") return { status: "guest" };
	const tier = num(row.claimed_tier);
	if (row.status !== "ok" || tier === null) return { status: "failed" };
	return {
		status: "ok",
		claim: {
			tier,
			coins: Math.max(0, Math.floor(num(row.coins) ?? 0)),
			keys: Math.max(0, Math.floor(num(row.keys) ?? 0)),
			chest: parseChest(row.chest),
			itemId: typeof row.item_id === "string" ? row.item_id : null,
			duplicate: row.duplicate === true,
			wallet: num(row.wallet),
			ownedItemIds: Array.isArray(row.owned_item_ids) ? row.owned_item_ids.filter((id): id is string => typeof id === "string") : [],
			chestState: parseChestState(row.state),
			pass: parseSeasonPassState(row),
		},
	};
}

/** Claims one tier. The answer already holds the new wallet, items and keys; the caller applies them. */
export async function claimSeasonPassTier(tier: number): Promise<TierClaimResult> {
	try {
		const { data: { session } } = await getAccountSession();
		if (!session?.user) return { status: "guest" };
		if (!(await isOnline())) return { status: "failed" };
		const { data, error } = await supabase.rpc("season_pass_claim", { p_tier: tier });
		if (error) return { status: "failed" };
		const result = parseTierClaim(data);
		if (result.status === "ok") {
			if (result.claim.pass) publishSeasonPass(result.claim.pass);
			publishChestState(result.claim.chestState);
		}
		return result;
	} catch {
		return { status: "failed" };
	}
}

/** Claims one premium tier (the same answer as a free one). */
export async function claimSeasonPassPremiumTier(tier: number): Promise<TierClaimResult> {
	try {
		const { data: { session } } = await getAccountSession();
		if (!session?.user) return { status: "guest" };
		if (!(await isOnline())) return { status: "failed" };
		const { data, error } = await supabase.rpc("season_pass_claim_premium", { p_tier: tier });
		if (error) return { status: "failed" };
		const result = parseTierClaim(data);
		if (result.status === "ok") {
			if (result.claim.pass) publishSeasonPass(result.claim.pass);
			publishChestState(result.claim.chestState);
		}
		return result;
	} catch {
		return { status: "failed" };
	}
}

export type UnlockPremiumResult = { status: "ok" | "already" | "poor" | "unavailable" | "guest" | "failed"; wallet: number | null };

/** Opens the premium track of this season for coins. On ok the answer holds the balance now. */
export async function unlockSeasonPassPremium(): Promise<UnlockPremiumResult> {
	try {
		const { data: { session } } = await getAccountSession();
		if (!session?.user) return { status: "guest", wallet: null };
		const { data, error } = await supabase.rpc("season_pass_unlock_premium");
		if (error || !data || typeof data !== "object") return { status: "failed", wallet: null };
		const row = data as Record<string, unknown>;
		const pass = parseSeasonPassState(row);
		if (pass) publishSeasonPass(pass);
		const wallet = num(row.wallet);
		if (row.status === "ok" || row.status === "already" || row.status === "poor" || row.status === "unavailable") return { status: row.status, wallet };
		if (row.status === "guest" || row.status === "unauthenticated") return { status: "guest", wallet: null };
		return { status: "failed", wallet: null };
	} catch {
		return { status: "failed", wallet: null };
	}
}

// ---- reporting games -----------------------------------------------------------------------------------------------

const PENDING_KEY = "SEASON_PASS_PENDING_V1";
const FLUSH_DELAY_MS = 2500;
const VERIFIED_SYNC_DELAY_MS = 5000;
/** A report the server called too fast is tried again a little after its 30 seconds. */
const RETRY_GAP_MS = (MIN_GAP_SECONDS + 1) * 1000;

interface StoredReports {
	/** What this device already counted today (sent or waiting), so it stops asking once a limit is reached. */
	ledger: DayLedger;
	/** Games the server has not heard about yet. */
	pending: Partial<Record<ReportedSource, number>>;
}

let memory: StoredReports | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let verifiedTimer: ReturnType<typeof setTimeout> | null = null;
let chain: Promise<unknown> = Promise.resolve();

function serialize<T>(operation: () => Promise<T>): Promise<T> {
	const result = chain.then(operation, operation);
	chain = result.catch(() => undefined);
	return result;
}

async function loadReports(now: Date): Promise<StoredReports> {
	const day = utcDay(now);
	if (memory) {
		if (memory.ledger.day !== day) memory = { ledger: emptyLedger(day), pending: memory.pending };
		return memory;
	}
	let loaded: StoredReports = { ledger: emptyLedger(day), pending: {} };
	try {
		const raw = await AsyncStorage.getItem(PENDING_KEY);
		const parsed = raw ? JSON.parse(raw) : null;
		if (parsed && typeof parsed === "object") {
			const pending: Partial<Record<ReportedSource, number>> = {};
			for (const source of REPORTED_SOURCES) {
				const n = parsed.pending?.[source];
				if (typeof n === "number" && Number.isFinite(n) && n > 0) pending[source] = Math.min(Math.floor(n), SOURCE_RULES[source].max);
			}
			const ledger = parsed.ledger?.day === day && typeof parsed.ledger.xp === "number" && parsed.ledger.events && typeof parsed.ledger.events === "object"
				? { day, events: parsed.ledger.events as DayLedger["events"], xp: parsed.ledger.xp }
				: emptyLedger(day);
			loaded = { ledger, pending };
		}
	} catch {
		// a lost queue only costs a few XP
	}
	memory = loaded;
	return loaded;
}

async function saveReports(reports: StoredReports): Promise<void> {
	try {
		await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(reports));
	} catch {
		// the queue is a nicety
	}
}

/** Sends the games waiting, one event per source (the server takes one a source in 30 s, so the rest follows later). */
export function flushSeasonPassReports(now: Date = new Date()): Promise<void> {
	if (flushTimer) {
		clearTimeout(flushTimer);
		flushTimer = null;
	}
	return serialize(async () => {
		const reports = await loadReports(now);
		if (REPORTED_SOURCES.every((source) => !reports.pending[source])) return;
		const { data: { session } } = await getAccountSession();
		if (!session?.user) {
			// a guest earns nothing: drop what was counted instead of keeping it for a later account
			reports.pending = {};
			await saveReports(reports);
			return;
		}
		for (const source of REPORTED_SOURCES) {
			if (!reports.pending[source]) continue;
			try {
				const { data, error } = await supabase.rpc("season_pass_add_xp", { p_source: source });
				if (error) continue;
				const status = (data as { status?: unknown } | null)?.status;
				if (status === "too_fast") continue;
				if (status !== "bad_source" && status !== "guest") {
					const state = parseSeasonPassState(data);
					if (!state) continue;
					publishSeasonPass(state);
				}
			} catch {
				continue;
			}
			reports.pending[source] = (reports.pending[source] ?? 0) - 1;
			if ((reports.pending[source] ?? 0) <= 0) delete reports.pending[source];
		}
		await saveReports(reports);
		if (REPORTED_SOURCES.some((source) => reports.pending[source]) && !flushTimer) {
			flushTimer = setTimeout(() => {
				void flushSeasonPassReports();
			}, RETRY_GAP_MS);
		}
	});
}

/**
 * A finished game of a source. It must have been long and good enough (meetsMinimum), then it is counted against the
 * device's own copy of the daily limits and sent soon.
 */
export function recordSeasonPassGame(source: ReportedSource | null, stats: PlayStats = {}, now: Date = new Date()): void {
	if (!source || !meetsMinimum(source, stats)) return;
	void serialize(async () => {
		const reports = await loadReports(now);
		const credited = creditEvents(reports.ledger, source, 1);
		if (credited.counted < 1) return;
		reports.ledger = credited.ledger;
		reports.pending[source] = (reports.pending[source] ?? 0) + 1;
		await saveReports(reports);
		if (!flushTimer) {
			flushTimer = setTimeout(() => {
				void flushSeasonPassReports();
			}, FLUSH_DELAY_MS);
		}
	});
}

const moreGameStarts = new Map<string, number>();
/** A More Games game was opened (or finished, so the next one starts): its length is measured from here. */
export function noteMoreGameStart(gameId: string, at: number = Date.now()): void {
	moreGameStarts.set(gameId, at);
}

/** Versus and daily tasks are counted by the server; this asks it to look soon (the opponent's report may be a moment late). */
export function scheduleSeasonPassSync(delayMs = VERIFIED_SYNC_DELAY_MS): void {
	if (verifiedTimer) clearTimeout(verifiedTimer);
	verifiedTimer = setTimeout(() => {
		verifiedTimer = null;
		void flushSeasonPassReports().then(() => syncSeasonPass());
	}, delayMs);
}

/** Watches the finished games of the More Games and Versus and the claimed daily tasks. Call once; returns the stop. */
export function startSeasonPassTracking(): () => void {
	const stopOutcomes = subscribeToOutcomes((gameId, outcome) => {
		if (gameId === "versus") {
			scheduleSeasonPassSync();
			return;
		}
		const now = Date.now();
		const startedAt = moreGameStarts.get(gameId);
		moreGameStarts.set(gameId, now);
		recordSeasonPassGame(sourceForOutcome(gameId, outcome), { durationMs: startedAt === undefined ? null : now - startedAt });
	});
	const stopQuests = onQuestsClaimed(() => scheduleSeasonPassSync(1500));
	return () => {
		stopOutcomes();
		stopQuests();
	};
}

/** Test hook: forget what the module keeps in memory. */
export function resetSeasonPassReports(): void {
	memory = null;
	moreGameStarts.clear();
	if (flushTimer) clearTimeout(flushTimer);
	if (verifiedTimer) clearTimeout(verifiedTimer);
	flushTimer = null;
	verifiedTimer = null;
	chain = Promise.resolve();
}
