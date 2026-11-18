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
	DAILY_XP_CAP,
	REPORTED_SOURCES,
	SOURCE_RULES,
	TIER_COUNT,
	TIER_REWARDS,
	claimSeasonPassTier,
	claimableTiers,
	creditEvents,
	daysToFinishAtCap,
	emptyLedger,
	flushSeasonPassReports,
	getTierReward,
	parseSeasonPassState,
	parseTierClaim,
	recordSeasonPassGame,
	resetSeasonPassReports,
	seasonTimeLeft,
	sourceForGameMode,
	sourceForOutcome,
	tierCost,
	tierForXp,
	tierProgress,
	tierXp,
	totalRewards,
	type XpSource,
} from "./SeasonPass";
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
		expect(possible).toBe(647);
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

	it("keeps solo games and More Games on the reported list, and Versus and tasks on the server's", () => {
		expect(REPORTED_SOURCES).toEqual(["classic", "chaos", "challenge", "more_win", "more_play"]);
		expect(sourceForGameMode("classic")).toBe("classic");
		expect(sourceForGameMode("chaos")).toBe("chaos");
		for (const mode of [GameModeType.TimeAttack, GameModeType.DailyPuzzle, GameModeType.MoveLimit, GameModeType.Rescue, GameModeType.ComboTrial]) {
			expect(sourceForGameMode(mode)).toBe("challenge");
		}
		expect(sourceForGameMode(GameModeType.Level)).toBeNull();
		expect(sourceForOutcome("chess", "win")).toBe("more_win");
		expect(sourceForOutcome("durak", "loss")).toBe("more_play");
		expect(sourceForOutcome("tictactoe", "draw")).toBe("more_play");
		expect(sourceForOutcome("versus", "win")).toBeNull();
	});
});

describe("rewards", () => {
	it("has a reward for each of the 30 tiers, in order", () => {
		expect(TIER_REWARDS).toHaveLength(TIER_COUNT);
		TIER_REWARDS.forEach((reward, index) => expect(reward.tier).toBe(index + 1));
		expect(getTierReward(10)?.itemId).toBe("piece_season_dawn");
		expect(getTierReward(31)).toBeUndefined();
	});

	it("pays every tier something", () => {
		for (const reward of TIER_REWARDS) {
			expect(reward.coins + reward.keys + (reward.chest ? 1 : 0) + (reward.itemId ? 1 : 0)).toBeGreaterThan(0);
		}
	});

	it("mixes coins, keys, chests and four exclusive cosmetics", () => {
		expect(totalRewards()).toEqual({ coins: 3650, keys: 8, smallChests: 3, bigChests: 1, items: 4 });
	});

	it("keeps the cosmetics out of the shop and out of every chest", () => {
		const ids = TIER_REWARDS.flatMap((reward) => (reward.itemId ? [reward.itemId] : []));
		expect(new Set(ids).size).toBe(4);
		for (const id of ids) {
			const item = getShopItem(id)!;
			expect(item).toBeDefined();
			// price 0 and secret: the chest pool and the collections only take priced, public items
			expect({ id, price: item.price, secret: item.secret, chestOnly: item.chestOnly }).toEqual({ id, price: 0, secret: true, chestOnly: undefined });
		}
		const chestPool = SHOP_ITEMS.filter((item) => item.price > 0 && !item.secret).map((item) => item.id);
		for (const id of ids) expect(chestPool).not.toContain(id);
	});

	it("is the table of the migration", () => {
		const rows = [...sqlFunction("season_pass_reward").matchAll(/WHEN (\d+) THEN '(\{[^']*\})'::jsonb/g)];
		expect(rows).toHaveLength(TIER_COUNT);
		for (const [, tier, json] of rows) {
			const parsed = JSON.parse(json) as { coins?: number; keys?: number; chest?: string; item?: string };
			expect({ tier: Number(tier), coins: parsed.coins ?? 0, keys: parsed.keys ?? 0, chest: parsed.chest ?? null, itemId: parsed.item ?? null })
				.toEqual(TIER_REWARDS[Number(tier) - 1]);
		}
	});
});

describe("the migration", () => {
	it("has the same XP table as the client", () => {
		expect(sqlFunction("season_pass_tier_xp")).toContain("5 * p_tier * p_tier + 145 * p_tier");
		expect(sqlFunction("season_pass_tier")).toContain("5 * n * n + 145 * n");
		expect(sqlFunction("season_pass_tier_count")).toContain("SELECT 30;");
		expect(sqlFunction("season_pass_daily_cap")).toContain(`SELECT ${DAILY_XP_CAP};`);
		const xp = sqlFunction("season_pass_event_xp");
		const max = sqlFunction("season_pass_event_max");
		for (const source of ALL_SOURCES) {
			expect(xp).toContain(`WHEN '${source}' THEN ${SOURCE_RULES[source].xp}\n`);
			expect(max).toContain(`WHEN '${source}' THEN ${SOURCE_RULES[source].max}\n`);
		}
	});

	it("adds the four cosmetics to the catalog as server-only and unpriced", () => {
		for (const reward of TIER_REWARDS.filter((entry) => entry.itemId)) {
			expect(SQL).toContain(`('${reward.itemId}', 0, 'server_only')`);
		}
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
		for (const helper of ["_season_pass_credit(uuid, text, integer)", "_season_pass_sync_verified(uuid, uuid)", "_season_pass_state(uuid)"]) {
			expect(SQL).toContain(`REVOKE ALL ON FUNCTION public.${helper} FROM PUBLIC, anon, authenticated;`);
		}
	});

	it("lets the client report solo games only, and counts Versus and tasks from the server's own tables", () => {
		expect(sqlFunction("season_pass_add_xp")).toContain("('classic', 'chaos', 'challenge', 'more_win', 'more_play')");
		const verified = sqlFunction("_season_pass_sync_verified");
		expect(verified).toContain("public.versus_matches");
		expect(verified).toContain("public.daily_quest_claims");
	});
});

describe("the pass as the server answers", () => {
	const answer = { status: "ok", season: "2026-11", ends_at: "2026-12-01T00:00:00+00:00", xp: 420, tier: 2, claimed: [1], today_xp: 120, daily_cap: 350 };

	it("reads it", () => {
		expect(parseSeasonPassState(answer)).toEqual({ season: "2026-11", endsAt: Date.parse("2026-12-01T00:00:00Z"), xp: 420, tier: 2, claimed: [1], todayXp: 120, dailyCap: 350 });
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
			status: "ok", claimed_tier: 30, coins: 400, keys: 0, item_id: "background_season_zenith", duplicate: false, wallet: 900,
			chest: { size: "big", kind: "coins", coins: 1500, rarity: "legendary" }, owned_item_ids: ["background_season_zenith"],
			state: { keys: 3, key_shards: 1, pity: 2, collection_sets: [] },
			season: "2026-11", ends_at: "2026-12-01T00:00:00+00:00", xp: 8850, tier: 30, claimed: [30], today_xp: 0, daily_cap: 350,
		});
		expect(result.status).toBe("ok");
		if (result.status !== "ok") return;
		expect(result.claim).toMatchObject({ tier: 30, coins: 400, wallet: 900, itemId: "background_season_zenith", duplicate: false });
		expect(result.claim.chest).toMatchObject({ size: "big", kind: "coins", coins: 1500 });
		expect(result.claim.chestState).toMatchObject({ keys: 3 });
		expect(result.claim.pass).toMatchObject({ tier: 30, xp: 8850 });
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

	it("sends the games in one call and stops at the daily limit of the source", async () => {
		mockRpc.mockResolvedValue(okAnswer);
		for (let i = 0; i < 9; i++) recordSeasonPassGame("classic");
		await flushSeasonPassReports();
		expect(mockRpc).toHaveBeenCalledTimes(1);
		expect(mockRpc).toHaveBeenCalledWith("season_pass_add_xp", { p_source: "classic", p_count: SOURCE_RULES.classic.max });
	});

	it("does not even ask for a source after its limit was reached today", async () => {
		mockRpc.mockResolvedValue(okAnswer);
		for (let i = 0; i < 5; i++) recordSeasonPassGame("chaos");
		await flushSeasonPassReports();
		mockRpc.mockClear();
		recordSeasonPassGame("chaos");
		await flushSeasonPassReports();
		expect(mockRpc).not.toHaveBeenCalled();
	});

	it("keeps what could not be sent and sends it with the next try", async () => {
		mockRpc.mockResolvedValue({ data: null, error: { message: "offline" } });
		recordSeasonPassGame("more_win");
		recordSeasonPassGame("more_win");
		await flushSeasonPassReports();
		expect(mockRpc).toHaveBeenCalledTimes(1);
		mockRpc.mockResolvedValue(okAnswer);
		await flushSeasonPassReports();
		expect(mockRpc).toHaveBeenLastCalledWith("season_pass_add_xp", { p_source: "more_win", p_count: 2 });
		mockRpc.mockClear();
		await flushSeasonPassReports();
		expect(mockRpc).not.toHaveBeenCalled();
	});

	it("drops the games of a guest instead of asking the server", async () => {
		mockGetSession.mockResolvedValue({ data: { session: { user: { id: "g", is_anonymous: true } } } });
		recordSeasonPassGame("classic");
		await flushSeasonPassReports();
		expect(mockRpc).not.toHaveBeenCalled();
		mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
		mockRpc.mockResolvedValue(okAnswer);
		await flushSeasonPassReports();
		expect(mockRpc).not.toHaveBeenCalled();
	});

	it("ignores a game of a mode without XP", async () => {
		recordSeasonPassGame(null);
		await flushSeasonPassReports();
		expect(mockRpc).not.toHaveBeenCalled();
	});
});
