import fs from "fs";
import path from "path";

jest.mock("@react-native-async-storage/async-storage", () =>
	require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
const mockRpc = jest.fn();
const mockGetSession = jest.fn();
jest.mock("./Supabase", () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args), auth: { getSession: () => mockGetSession() } } }));

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	COSMETIC_FALLBACK_COINS,
	DAILY_XP_CAP,
	MINIMUM_PLAY,
	MIN_GAP_SECONDS,
	REPORTED_SOURCES,
	SEASON_COSMETICS,
	SOURCE_RULES,
	TIER_COUNT,
	TIER_REWARDS,
	claimSeasonPassTier,
	claimableTiers,
	cosmeticsForSeason,
	creditEvents,
	daysToFinishAtCap,
	emptyLedger,
	flushSeasonPassReports,
	getTierReward,
	meetsMinimum,
	noteMoreGameStart,
	parseSeasonPassState,
	parseTierClaim,
	recordSeasonPassGame,
	resetSeasonPassReports,
	resolveReward,
	rewardValue,
	seasonTimeLeft,
	sourceForGameMode,
	sourceForOutcome,
	startSeasonPassTracking,
	tierCost,
	tierForXp,
	tierProgress,
	tierXp,
	totalRewards,
	type XpSource,
} from "./SeasonPass";
import { recordGameOutcome } from "./GameStats";
import { SHOP_ITEMS, getShopItem } from "./Shop";
import { GameModeType } from "@/hooks/useAppState";

const SQL = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20261118130000_season_pass.sql"), "utf8").replace(/\r\n/g, "\n");

/** The body of one function of the migration. */
function sqlFunction(name: string): string {
	const start = SQL.indexOf(`FUNCTION public.${name}(`);
	if (start < 0) throw new Error(`${name} not in the migration`);
	const end = SQL.indexOf("$$;", SQL.indexOf("$$", SQL.indexOf("AS $$", start)) + 2);
	return SQL.slice(start, end);
}

const ALL_SOURCES = Object.keys(SOURCE_RULES) as XpSource[];
const SEASONS = Object.keys(SEASON_COSMETICS);
const COSMETIC_IDS = SEASONS.flatMap((season) => Object.values(SEASON_COSMETICS[season]));
const flushPromises = () => new Promise<void>((resolve) => setImmediate(resolve));

beforeEach(() => {
	mockRpc.mockReset();
	mockGetSession.mockReset();
	mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
	resetSeasonPassReports();
	(AsyncStorage as unknown as { clear: () => Promise<void> }).clear();
});

afterEach(() => {
	resetSeasonPassReports();
});

describe("tiers", () => {
	it("cost 150 XP for the first tier, 440 for the last and 8 850 in all", () => {
		expect(tierXp(0)).toBe(0);
		expect(tierXp(1)).toBe(150);
		expect(tierCost(1)).toBe(150);
		expect(tierCost(30)).toBe(440);
		expect(tierXp(TIER_COUNT)).toBe(8850);
	});

	it("each tier costs more than the one before", () => {
		for (let tier = 2; tier <= TIER_COUNT; tier++) expect(tierCost(tier)).toBeGreaterThan(tierCost(tier - 1));
	});

	it("is reached exactly at its XP and never past the last tier", () => {
		expect(tierForXp(0)).toBe(0);
		expect(tierForXp(149)).toBe(0);
		expect(tierForXp(150)).toBe(1);
		expect(tierForXp(tierXp(12) - 1)).toBe(11);
		expect(tierForXp(tierXp(12))).toBe(12);
		expect(tierForXp(8850)).toBe(30);
		expect(tierForXp(1_000_000)).toBe(30);
	});

	it("shows how far into the tier being worked on", () => {
		expect(tierProgress(0)).toEqual({ tier: 0, into: 0, needed: 150, fraction: 0 });
		expect(tierProgress(200)).toMatchObject({ tier: 1, into: 50, needed: 160 });
		expect(tierProgress(200).fraction).toBeCloseTo(50 / 160);
		expect(tierProgress(8850)).toEqual({ tier: 30, into: 0, needed: 0, fraction: 1 });
	});

	it("takes under four weeks even at the daily limit", () => {
		expect(daysToFinishAtCap()).toBe(26);
		expect(daysToFinishAtCap()).toBeLessThanOrEqual(28);
	});
});

describe("XP rules and daily limits", () => {
	it("gives each event of a source its XP", () => {
		expect(creditEvents(emptyLedger("2026-11-18"), "classic", 1).xp).toBe(20);
		expect(creditEvents(emptyLedger("2026-11-18"), "versus", 1).xp).toBe(40);
		expect(creditEvents(emptyLedger("2026-11-18"), "more_play", 1).xp).toBe(8);
		expect(creditEvents(emptyLedger("2026-11-18"), "quest_bonus", 1).xp).toBe(30);
		expect(creditEvents(emptyLedger("2026-11-18"), "level", 1).xp).toBe(10);
	});

	it("stops counting a source after its daily events", () => {
		let ledger = emptyLedger("2026-11-18");
		let total = 0;
		for (let i = 0; i < 12; i++) {
			const step = creditEvents(ledger, "classic", 1);
			ledger = step.ledger;
			total += step.xp;
		}
		expect(ledger.events.classic).toBe(SOURCE_RULES.classic.max);
		expect(total).toBe(SOURCE_RULES.classic.max * SOURCE_RULES.classic.xp);
		expect(creditEvents(ledger, "classic", 1)).toMatchObject({ xp: 0, counted: 0 });
	});

	it("pays the level map 10 XP for at most 5 first clears a day", () => {
		expect(SOURCE_RULES.level).toEqual({ xp: 10, max: 5 });
		const week = creditEvents(emptyLedger("d"), "level", 9);
		expect(week).toMatchObject({ counted: 5, xp: 50 });
	});

	it("counts a batch of events as the single ones and clamps it", () => {
		const batch = creditEvents(emptyLedger("d"), "challenge", 10);
		expect(batch).toMatchObject({ counted: SOURCE_RULES.challenge.max, xp: SOURCE_RULES.challenge.max * SOURCE_RULES.challenge.xp });
		expect(creditEvents(emptyLedger("d"), "classic", -3)).toMatchObject({ counted: 0, xp: 0 });
		expect(creditEvents(emptyLedger("d"), "classic", 2.9).counted).toBe(2);
	});

	it("never gives more than the daily XP limit, whatever the sources", () => {
		let ledger = emptyLedger("d");
		let total = 0;
		for (const source of ALL_SOURCES) {
			const step = creditEvents(ledger, source, 100);
			ledger = step.ledger;
			total += step.xp;
		}
		expect(total).toBe(DAILY_XP_CAP);
		expect(ledger.xp).toBe(DAILY_XP_CAP);
	});

	it("has sources that together could pay more than the limit (so the limit is what holds)", () => {
		const possible = ALL_SOURCES.reduce((sum, source) => sum + SOURCE_RULES[source].xp * SOURCE_RULES[source].max, 0);
		expect(possible).toBeGreaterThan(DAILY_XP_CAP);
		expect(possible).toBe(697);
	});

	it("keeps a normal day short of the limit", () => {
		// 3 Classic, 1 Chaos, a Versus match, 3 daily tasks and the bonus
		let ledger = emptyLedger("d");
		let total = 0;
		for (const [source, count] of [["classic", 3], ["chaos", 1], ["versus", 1], ["quest_task", 3], ["quest_bonus", 1]] as const) {
			const step = creditEvents(ledger, source, count);
			ledger = step.ledger;
			total += step.xp;
		}
		expect(total).toBe(60 + 20 + 40 + 45 + 30);
		expect(total).toBeLessThan(DAILY_XP_CAP);
	});

	it("keeps solo games, levels and More Games on the reported list, and Versus and tasks on the server's", () => {
		expect(REPORTED_SOURCES).toEqual(["classic", "chaos", "challenge", "level", "more_win", "more_play"]);
		expect(sourceForGameMode("classic")).toBe("classic");
		expect(sourceForGameMode("chaos")).toBe("chaos");
		for (const mode of [GameModeType.TimeAttack, GameModeType.DailyPuzzle, GameModeType.MoveLimit, GameModeType.Rescue, GameModeType.ComboTrial]) {
			expect(sourceForGameMode(mode)).toBe("challenge");
		}
		// a level pays through its first clear (LevelProgress), not through the game's end
		expect(sourceForGameMode(GameModeType.Level)).toBeNull();
		expect(sourceForOutcome("chess", "win")).toBe("more_win");
		expect(sourceForOutcome("durak", "loss")).toBe("more_play");
		expect(sourceForOutcome("tictactoe", "draw")).toBe("more_play");
		expect(sourceForOutcome("versus", "win")).toBeNull();
	});
});

describe("the minimum a game must reach", () => {
	it("asks Classic and Chaos for 300 points and a minute", () => {
		for (const source of ["classic", "chaos"] as const) {
			expect(MINIMUM_PLAY[source]).toEqual({ score: 300, seconds: 60 });
			expect(meetsMinimum(source, { score: 300, durationMs: 60_000 })).toBe(true);
			expect(meetsMinimum(source, { score: 299, durationMs: 120_000 })).toBe(false);
			expect(meetsMinimum(source, { score: 5000, durationMs: 59_999 })).toBe(false);
			expect(meetsMinimum(source, { score: 5000 })).toBe(false);
			expect(meetsMinimum(source, { score: 5000, durationMs: null })).toBe(false);
		}
	});

	it("asks the challenge modes for 100 points and 45 seconds", () => {
		expect(meetsMinimum("challenge", { score: 100, durationMs: 45_000 })).toBe(true);
		expect(meetsMinimum("challenge", { score: 99, durationMs: 60_000 })).toBe(false);
		expect(meetsMinimum("challenge", { score: 500, durationMs: 44_000 })).toBe(false);
	});

	it("asks More Games for 30 seconds, and a game that cannot tell its length does not count", () => {
		for (const source of ["more_win", "more_play"] as const) {
			expect(meetsMinimum(source, { durationMs: 30_000 })).toBe(true);
			expect(meetsMinimum(source, { durationMs: 29_999 })).toBe(false);
			expect(meetsMinimum(source, {})).toBe(false);
		}
	});

	it("asks nothing of a first level clear", () => {
		expect(meetsMinimum("level")).toBe(true);
	});

	it("keeps a short or poor game out of the queue", async () => {
		mockRpc.mockResolvedValue({ data: { status: "ok" }, error: null });
		recordSeasonPassGame("classic", { score: 200, durationMs: 90_000 });
		recordSeasonPassGame("classic", { score: 900, durationMs: 20_000 });
		recordSeasonPassGame("chaos", {});
		await flushSeasonPassReports();
		expect(mockRpc).not.toHaveBeenCalled();
	});

	it("measures a More Games game from when it was opened and counts the next one from the last result", async () => {
		const stop = startSeasonPassTracking();
		const spy = jest.spyOn(Date, "now");
		try {
			mockRpc.mockResolvedValue({ data: { status: "ok", season: "2026-11", xp: 8, tier: 0, claimed: [], today_xp: 8, daily_cap: 350 }, error: null });
			spy.mockReturnValue(1_000_000);
			noteMoreGameStart("chess", 1_000_000);
			// a win after 10 s: too short; the rematch starts there
			spy.mockReturnValue(1_010_000);
			recordGameOutcome("chess", "win");
			// a loss 40 s later counts as a More Games game
			spy.mockReturnValue(1_050_000);
			recordGameOutcome("chess", "loss");
			// a game nobody opened (no start known) does not count
			recordGameOutcome("durak", "win");
			await flushPromises();
			await flushSeasonPassReports();
			await flushPromises();
			expect(mockRpc.mock.calls.map((call) => call[1])).toEqual([{ p_source: "more_play" }]);
		} finally {
			spy.mockRestore();
			stop();
		}
	});
});

describe("rewards", () => {
	it("has a reward for each of the 30 tiers, in order", () => {
		expect(TIER_REWARDS).toHaveLength(TIER_COUNT);
		TIER_REWARDS.forEach((reward, index) => expect(reward.tier).toBe(index + 1));
		expect(getTierReward(10)?.cosmetic).toBe(true);
		expect(getTierReward(31)).toBeUndefined();
	});

	it("pays every tier something", () => {
		for (const reward of TIER_REWARDS) {
			expect(reward.coins + reward.keys + (reward.chest ? 1 : 0) + (reward.cosmetic ? 1 : 0)).toBeGreaterThan(0);
		}
	});

	it("mixes coins, 5 keys, 2 small chests, the big chest and 4 cosmetics", () => {
		expect(totalRewards(SEASON_COSMETICS["2026-11"])).toEqual({ coins: 1015, keys: 5, smallChests: 2, bigChests: 1, items: 4 });
	});

	it("keeps the cosmetic tiers at 10, 18, 25 and 30, the big chest at 30 and the coins growing with the tier", () => {
		expect(TIER_REWARDS.filter((reward) => reward.cosmetic).map((reward) => reward.tier)).toEqual([10, 18, 25, 30]);
		expect(getTierReward(30)).toMatchObject({ chest: "big", cosmetic: true });
		const coins = TIER_REWARDS.filter((reward) => reward.coins > 0).map((reward) => reward.coins);
		for (let i = 1; i < coins.length; i++) expect(coins[i]).toBeGreaterThanOrEqual(coins[i - 1] - 0);
		expect(coins[coins.length - 1]).toBeGreaterThan(coins[0] * 3);
	});

	it("is about half of the first draft (9 050 coin-equivalents: 3 650 coins, 8 keys, 3 small chests, a big chest)", () => {
		const value = rewardValue(totalRewards(SEASON_COSMETICS["2026-11"]));
		expect(value).toBe(4815);
		expect(value / 9050).toBeGreaterThan(0.45);
		expect(value / 9050).toBeLessThan(0.6);
	});

	it("pays coins for the cosmetic tiers of a season without a set", () => {
		const bare = totalRewards({});
		expect(bare).toEqual({ coins: 1015 + 100 + 150 + 200 + 300, keys: 5, smallChests: 2, bigChests: 1, items: 0 });
		expect(resolveReward(getTierReward(10)!, {})).toMatchObject({ coins: 100, itemId: null });
		expect(resolveReward(getTierReward(30)!, {})).toMatchObject({ coins: 400, chest: "big", itemId: null });
		expect(resolveReward(getTierReward(10)!, { 10: "piece_season_dawn" })).toMatchObject({ coins: 0, itemId: "piece_season_dawn" });
		expect(cosmeticsForSeason("2030-01")).toEqual({});
	});

	it("rotates: four distinct new skins for each of 2026-11, 2026-12, 2027-01 and 2027-02, sold nowhere", () => {
		expect(SEASONS).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
		expect(COSMETIC_IDS).toHaveLength(16);
		expect(new Set(COSMETIC_IDS).size).toBe(16);
		for (const season of SEASONS) {
			expect(Object.keys(SEASON_COSMETICS[season]).map(Number)).toEqual([10, 18, 25, 30]);
			// blocks at 10 and 25, backgrounds at 18 and 30
			expect(SEASON_COSMETICS[season][10]).toMatch(/^piece_season_/);
			expect(SEASON_COSMETICS[season][25]).toMatch(/^piece_season_/);
			expect(SEASON_COSMETICS[season][18]).toMatch(/^background_season_/);
			expect(SEASON_COSMETICS[season][30]).toMatch(/^background_season_/);
		}
		const chestPool = SHOP_ITEMS.filter((item) => item.price > 0 && !item.secret).map((item) => item.id);
		for (const id of COSMETIC_IDS) {
			const item = getShopItem(id)!;
			expect(item).toBeDefined();
			// price 0 and secret: the chest pool and the collections only take priced, public items
			expect({ id, price: item.price, secret: item.secret, chestOnly: item.chestOnly }).toEqual({ id, price: 0, secret: true, chestOnly: undefined });
			expect(chestPool).not.toContain(id);
		}
	});

	it("gives each new background its own colours", () => {
		const gradients = COSMETIC_IDS.filter((id) => id.startsWith("background_")).map((id) => getShopItem(id)!.gradient!.join("|"));
		expect(new Set(gradients).size).toBe(8);
	});

	it("is the table of the migration", () => {
		const rows = [...sqlFunction("season_pass_reward").matchAll(/WHEN (\d+) THEN '(\{[^']*\})'::jsonb/g)];
		expect(rows).toHaveLength(TIER_COUNT);
		for (const [, tier, json] of rows) {
			const parsed = JSON.parse(json) as { coins?: number; keys?: number; chest?: string; cosmetic?: boolean };
			expect({ tier: Number(tier), coins: parsed.coins ?? 0, keys: parsed.keys ?? 0, chest: parsed.chest ?? null, cosmetic: parsed.cosmetic === true })
				.toEqual(TIER_REWARDS[Number(tier) - 1]);
		}
	});

	it("has the seasons' skins and the replacement coins of the migration", () => {
		const block = SQL.slice(SQL.indexOf("INSERT INTO public.season_pass_cosmetics"));
		const rows = [...block.slice(0, block.indexOf(";")).matchAll(/\('(\d{4}-\d{2})', (\d+), '([a-z0-9_]+)'\)/g)];
		const fromSql: Record<string, Record<number, string>> = {};
		for (const [, season, tier, id] of rows) (fromSql[season] ??= {})[Number(tier)] = id;
		expect(fromSql).toEqual(SEASON_COSMETICS);
		for (const [tier, coins] of Object.entries(COSMETIC_FALLBACK_COINS)) {
			expect(sqlFunction("season_pass_cosmetic_coins")).toContain(`WHEN ${tier} THEN ${coins}\n`);
		}
		for (const id of COSMETIC_IDS) expect(SQL).toContain(`('${id}', 0, 'server_only')`);
	});
});

describe("the migration", () => {
	it("has the same XP table as the client", () => {
		expect(sqlFunction("season_pass_tier_xp")).toContain("5 * p_tier * p_tier + 145 * p_tier");
		expect(sqlFunction("season_pass_tier")).toContain("5 * n * n + 145 * n");
		expect(sqlFunction("season_pass_tier_count")).toContain("SELECT 30;");
		expect(sqlFunction("season_pass_daily_cap")).toContain(`SELECT ${DAILY_XP_CAP};`);
		expect(sqlFunction("season_pass_min_gap_seconds")).toContain(`SELECT ${MIN_GAP_SECONDS};`);
		const xp = sqlFunction("season_pass_event_xp");
		const max = sqlFunction("season_pass_event_max");
		for (const source of ALL_SOURCES) {
			expect(xp).toContain(`WHEN '${source}' THEN ${SOURCE_RULES[source].xp}\n`);
			expect(max).toContain(`WHEN '${source}' THEN ${SOURCE_RULES[source].max}\n`);
		}
	});

	it("keeps the season's cosmetics in a table nobody but the functions can touch", () => {
		expect(SQL).toContain("CREATE TABLE IF NOT EXISTS public.season_pass_cosmetics");
		expect(SQL).toContain("ALTER TABLE public.season_pass_cosmetics ENABLE ROW LEVEL SECURITY;");
		expect(SQL).toContain("REVOKE ALL ON public.season_pass_cosmetics FROM anon, authenticated;");
		const claim = sqlFunction("season_pass_claim");
		expect(claim).toContain("public.season_pass_cosmetic(v_season, p_tier)");
		expect(claim).toContain("public.season_pass_cosmetic_coins(p_tier)");
		expect(sqlFunction("_season_pass_state")).toContain("FROM public.season_pass_cosmetics WHERE season_key = v_season");
	});

	it("lets no client touch the tables and refuses guests in every function it exposes", () => {
		expect(SQL).toContain("ALTER TABLE public.season_pass_progress ENABLE ROW LEVEL SECURITY;");
		expect(SQL).toContain("ALTER TABLE public.season_pass_daily ENABLE ROW LEVEL SECURITY;");
		expect(SQL).toContain("REVOKE ALL ON public.season_pass_progress FROM anon, authenticated;");
		expect(SQL).toContain("REVOKE ALL ON public.season_pass_daily FROM anon, authenticated;");
		expect(SQL).not.toMatch(/CREATE POLICY/);
		for (const name of ["season_pass_sync", "season_pass_add_xp", "season_pass_claim"]) {
			const body = sqlFunction(name);
			expect(body).toContain("auth.uid() IS NULL");
			expect(body).toContain("public.is_anonymous_caller()");
			expect(body).toContain("SECURITY DEFINER");
			expect(body).toContain("FOR UPDATE");
		}
		expect(SQL).toMatch(/REVOKE ALL ON FUNCTION public\.season_pass_claim\(integer\) FROM PUBLIC, anon;\nGRANT EXECUTE ON FUNCTION public\.season_pass_claim\(integer\) TO authenticated;/);
		// the helpers are not callable from the API at all
		for (const helper of ["_season_pass_credit(uuid, text, integer)", "_season_pass_sync_verified(uuid, uuid)", "_season_pass_state(uuid)", "season_pass_cosmetic(text, integer)"]) {
			expect(SQL).toContain(`REVOKE ALL ON FUNCTION public.${helper} FROM PUBLIC, anon, authenticated;`);
		}
	});

	it("lets the client report solo games and levels only, one a source every 30 seconds", () => {
		const add = sqlFunction("season_pass_add_xp");
		expect(add).toContain("('classic', 'chaos', 'challenge', 'level', 'more_win', 'more_play')");
		expect(add).toContain("'too_fast'");
		expect(add).toContain("season_pass_min_gap_seconds()");
		expect(add).toContain("max(last_at)");
		expect(SQL).toContain("UPDATE public.season_pass_daily SET last_at = now()");
		const verified = sqlFunction("_season_pass_sync_verified");
		expect(verified).toContain("public.versus_matches");
		expect(verified).toContain("public.daily_quest_claims");
		// no batch any more: the old two-argument function must not be left behind
		expect(SQL).not.toContain("p_count");
	});
});

describe("the pass as the server answers", () => {
	const answer = {
		status: "ok", season: "2026-12", ends_at: "2027-01-01T00:00:00+00:00", xp: 420, tier: 2, claimed: [1], today_xp: 120, daily_cap: 350,
		cosmetics: { "10": "piece_season_snowfall", "18": "background_season_frostlake", "x": "nope", "99": "nope" },
	};

	it("reads it, with the season's skins", () => {
		expect(parseSeasonPassState(answer)).toEqual({
			season: "2026-12", endsAt: Date.parse("2027-01-01T00:00:00Z"), xp: 420, tier: 2, claimed: [1], todayXp: 120, dailyCap: 350,
			cosmetics: { 10: "piece_season_snowfall", 18: "background_season_frostlake" },
		});
	});

	it("shows the set the server names even when the device knows another, and the device's own set when it names none", () => {
		expect(cosmeticsForSeason("2026-12", parseSeasonPassState(answer)!.cosmetics)).toEqual({ 10: "piece_season_snowfall", 18: "background_season_frostlake" });
		expect(cosmeticsForSeason("2026-12", {})).toEqual({});
		expect(cosmeticsForSeason("2026-12")).toEqual(SEASON_COSMETICS["2026-12"]);
		const { cosmetics, ...bare } = answer;
		expect(parseSeasonPassState(bare)!.cosmetics).toEqual(SEASON_COSMETICS["2026-12"]);
	});

	it("rejects what is not a complete answer, and a guest's", () => {
		expect(parseSeasonPassState(null)).toBeNull();
		expect(parseSeasonPassState({ status: "guest" })).toBeNull();
		expect(parseSeasonPassState({ ...answer, xp: "420" })).toBeNull();
		expect(parseSeasonPassState({ status: "ok", season: "2026-11" })).toBeNull();
	});

	it("ignores claimed tiers that cannot exist and clamps the tier", () => {
		expect(parseSeasonPassState({ ...answer, claimed: [1, 31, 0, 2.5, "3"], tier: 99 })).toMatchObject({ claimed: [1], tier: 30 });
	});

	it("lists the tiers reached and not claimed", () => {
		expect(claimableTiers({ tier: 4, claimed: [1, 3] })).toEqual([2, 4]);
		expect(claimableTiers({ tier: 0, claimed: [] })).toEqual([]);
		expect(claimableTiers({ tier: 30, claimed: [] })).toHaveLength(30);
		expect(claimableTiers(null)).toEqual([]);
	});

	it("counts the time to the season's end", () => {
		const state = { endsAt: Date.parse("2026-12-01T00:00:00Z") };
		expect(seasonTimeLeft(state, new Date("2026-11-28T20:00:00Z"))).toMatchObject({ days: 2, hours: 4 });
		expect(seasonTimeLeft(state, new Date("2026-12-02T00:00:00Z"))).toMatchObject({ days: 0, hours: 0, ms: 0 });
		// no answer yet: the leaderboard's own calendar
		expect(seasonTimeLeft(null, new Date("2026-11-30T12:00:00Z"))).toMatchObject({ days: 0, hours: 12 });
	});
});

describe("claiming", () => {
	it("reads a claim with a chest, an item and the new wallet", () => {
		const result = parseTierClaim({
			status: "ok", claimed_tier: 30, coins: 100, keys: 0, item_id: "background_season_zenith", duplicate: false, wallet: 900,
			chest: { size: "big", kind: "coins", coins: 1500, rarity: "legendary" }, owned_item_ids: ["background_season_zenith"],
			state: { keys: 3, key_shards: 1, pity: 2, collection_sets: [] },
			season: "2026-11", ends_at: "2026-12-01T00:00:00+00:00", xp: 8850, tier: 30, claimed: [30], today_xp: 0, daily_cap: 350,
		});
		expect(result.status).toBe("ok");
		if (result.status !== "ok") return;
		expect(result.claim).toMatchObject({ tier: 30, coins: 100, wallet: 900, itemId: "background_season_zenith", duplicate: false });
		expect(result.claim.chest).toMatchObject({ size: "big", kind: "coins", coins: 1500 });
		expect(result.claim.chestState).toMatchObject({ keys: 3 });
		expect(result.claim.pass).toMatchObject({ tier: 30, xp: 8850 });
	});

	it("reads a replacement for a skin the player owns, or a season without a set", () => {
		const owned = parseTierClaim({ status: "ok", claimed_tier: 10, coins: 100, keys: 0, item_id: "piece_season_dawn", duplicate: true, wallet: 100, chest: null, owned_item_ids: [] });
		expect(owned).toMatchObject({ status: "ok", claim: { itemId: "piece_season_dawn", duplicate: true, coins: 100 } });
		const bare = parseTierClaim({ status: "ok", claimed_tier: 18, coins: 150, keys: 0, item_id: null, duplicate: false, wallet: 150, chest: null, owned_item_ids: [] });
		expect(bare).toMatchObject({ status: "ok", claim: { itemId: null, duplicate: false, coins: 150 } });
	});

	it("tells locked, already, guest and broken answers apart", () => {
		expect(parseTierClaim({ status: "locked" })).toEqual({ status: "locked" });
		expect(parseTierClaim({ status: "already" })).toEqual({ status: "already" });
		expect(parseTierClaim({ status: "guest" })).toEqual({ status: "guest" });
		expect(parseTierClaim({ status: "unauthenticated" })).toEqual({ status: "guest" });
		expect(parseTierClaim({ status: "bad_tier" })).toEqual({ status: "failed" });
		expect(parseTierClaim(null)).toEqual({ status: "failed" });
	});

	it("does not ask the server for a guest", async () => {
		mockGetSession.mockResolvedValue({ data: { session: { user: { id: "g", is_anonymous: true } } } });
		expect(await claimSeasonPassTier(1)).toEqual({ status: "guest" });
		expect(mockRpc).not.toHaveBeenCalled();
	});

	it("claims through the function with the tier number", async () => {
		mockRpc.mockResolvedValue({ data: { status: "locked" }, error: null });
		expect(await claimSeasonPassTier(4)).toEqual({ status: "locked" });
		expect(mockRpc).toHaveBeenCalledWith("season_pass_claim", { p_tier: 4 });
		mockRpc.mockResolvedValue({ data: null, error: { message: "boom" } });
		expect(await claimSeasonPassTier(4)).toEqual({ status: "failed" });
	});
});

describe("reporting games", () => {
	const okAnswer = { data: { status: "ok", season: "2026-11", ends_at: "2026-12-01T00:00:00+00:00", xp: 100, tier: 0, claimed: [], today_xp: 100, daily_cap: 350 }, error: null };
	const goodClassic = { score: 400, durationMs: 90_000 };

	it("sends one event per source and call, and the rest after the 30 seconds", async () => {
		mockRpc.mockResolvedValue(okAnswer);
		for (let i = 0; i < 9; i++) recordSeasonPassGame("classic", goodClassic);
		await flushSeasonPassReports();
		// 9 finished games, but 5 count a day: one is sent now, 4 wait
		expect(mockRpc).toHaveBeenCalledTimes(1);
		expect(mockRpc).toHaveBeenCalledWith("season_pass_add_xp", { p_source: "classic" });
		for (let i = 0; i < 4; i++) await flushSeasonPassReports();
		expect(mockRpc).toHaveBeenCalledTimes(5);
		await flushSeasonPassReports();
		expect(mockRpc).toHaveBeenCalledTimes(5);
	});

	it("does not even ask for a source after its limit was reached today", async () => {
		mockRpc.mockResolvedValue(okAnswer);
		for (let i = 0; i < 5; i++) recordSeasonPassGame("chaos", goodClassic);
		for (let i = 0; i < 5; i++) await flushSeasonPassReports();
		mockRpc.mockClear();
		recordSeasonPassGame("chaos", goodClassic);
		await flushSeasonPassReports();
		expect(mockRpc).not.toHaveBeenCalled();
	});

	it("keeps a report the server called too fast and sends it with the next try", async () => {
		mockRpc.mockResolvedValue({ data: { status: "too_fast", retry_after: 20 }, error: null });
		recordSeasonPassGame("level");
		await flushSeasonPassReports();
		expect(mockRpc).toHaveBeenCalledTimes(1);
		mockRpc.mockResolvedValue(okAnswer);
		await flushSeasonPassReports();
		expect(mockRpc).toHaveBeenLastCalledWith("season_pass_add_xp", { p_source: "level" });
		mockRpc.mockClear();
		await flushSeasonPassReports();
		expect(mockRpc).not.toHaveBeenCalled();
	});

	it("keeps what could not be sent when the server is out of reach", async () => {
		mockRpc.mockResolvedValue({ data: null, error: { message: "offline" } });
		recordSeasonPassGame("level");
		recordSeasonPassGame("level");
		await flushSeasonPassReports();
		expect(mockRpc).toHaveBeenCalledTimes(1);
		mockRpc.mockResolvedValue(okAnswer);
		await flushSeasonPassReports();
		await flushSeasonPassReports();
		expect(mockRpc).toHaveBeenCalledTimes(3);
		mockRpc.mockClear();
		await flushSeasonPassReports();
		expect(mockRpc).not.toHaveBeenCalled();
	});

	it("drops the games of a guest instead of asking the server", async () => {
		mockGetSession.mockResolvedValue({ data: { session: { user: { id: "g", is_anonymous: true } } } });
		recordSeasonPassGame("classic", goodClassic);
		await flushSeasonPassReports();
		expect(mockRpc).not.toHaveBeenCalled();
		mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
		mockRpc.mockResolvedValue(okAnswer);
		await flushSeasonPassReports();
		expect(mockRpc).not.toHaveBeenCalled();
	});

	it("ignores a game of a mode without XP", async () => {
		recordSeasonPassGame(null, goodClassic);
		await flushSeasonPassReports();
		expect(mockRpc).not.toHaveBeenCalled();
	});
});
