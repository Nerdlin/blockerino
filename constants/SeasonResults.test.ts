import {
	getBestRewardRank,
	parseRewardEntries,
	shouldAnnounceEloReset,
	sortSeasonTitles,
	summarizeSeasonRewards,
	toLeaderboardRows,
} from "./SeasonResults";
import { createDefaultShopState, getVisibleShopItemsByCategory, isSecretShopItem } from "./Shop";

jest.mock("./Supabase", () => ({ supabase: {} }));
jest.mock("@react-native-async-storage/async-storage", () => ({
	__esModule: true,
	default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

const claimPayload = {
	entries: [
		{ season_key: "2026-09", board: "classic", rank: 1, coins: 1000, item_id: "background_season_gold" },
		{ season_key: "2026-09", board: "elo", rank: 4, coins: 300, item_id: null },
	],
};

describe("season reward claims", () => {
	it("parses the server payload and drops malformed rows", () => {
		const entries = parseRewardEntries({
			entries: [
				...claimPayload.entries,
				{ season_key: "2026-09", board: "bogus", rank: 1, coins: 5 },
				{ season_key: "2026-09", board: "chaos", rank: 0, coins: 5 },
				{ season_key: "2026-09", board: "chaos", rank: 2, coins: -5 },
				null,
			],
		});

		expect(entries).toEqual([
			{ seasonKey: "2026-09", board: "classic", rank: 1, coins: 1000, itemId: "background_season_gold" },
			{ seasonKey: "2026-09", board: "elo", rank: 4, coins: 300, itemId: null },
		]);
		expect(parseRewardEntries(null)).toEqual([]);
		expect(parseRewardEntries("nope")).toEqual([]);
	});

	it("also accepts entries that were already normalised and stored on the device", () => {
		const stored = parseRewardEntries(parseRewardEntries(claimPayload));
		expect(stored).toHaveLength(2);
		expect(stored[0].seasonKey).toBe("2026-09");
	});

	it("sums coins over all boards and ignores unknown shop items", () => {
		const entries = parseRewardEntries({
			entries: [
				...claimPayload.entries,
				{ season_key: "2026-09", board: "chaos", rank: 2, coins: 700, item_id: "background_season_silver" },
				{ season_key: "2026-09", board: "chaos", rank: 3, coins: 500, item_id: "no_such_item" },
			],
		});
		const summary = summarizeSeasonRewards(entries);

		expect(summary.coins).toBe(2500);
		expect(summary.itemIds).toEqual(["background_season_gold", "background_season_silver"]);
		expect(getBestRewardRank(entries)).toBe(1);
		expect(getBestRewardRank([])).toBeNull();
	});

	it("keeps the podium backgrounds secret until they are won", () => {
		const fresh = createDefaultShopState();
		expect(isSecretShopItem("background_season_gold")).toBe(true);
		expect(getVisibleShopItemsByCategory("background", fresh.ownedItemIds).some((item) => item.id === "background_season_gold")).toBe(false);

		const itemIds = summarizeSeasonRewards(parseRewardEntries(claimPayload)).itemIds;
		const won = { ...fresh, ownedItemIds: [...fresh.ownedItemIds, ...itemIds] };
		expect(getVisibleShopItemsByCategory("background", won.ownedItemIds).some((item) => item.id === "background_season_gold")).toBe(true);
	});
});

describe("elo reset announcement", () => {
	const now = Date.parse("2026-11-02T08:00:00Z");
	const reset = { before: 1200, after: 600, resetAt: "2026-11-02T00:05:00Z" };

	it("announces a fresh reset once", () => {
		expect(shouldAnnounceEloReset(reset, null, now)).toBe(true);
		expect(shouldAnnounceEloReset(reset, reset.resetAt, now)).toBe(false);
	});

	it("ignores missing, empty and old resets", () => {
		expect(shouldAnnounceEloReset(null, null, now)).toBe(false);
		expect(shouldAnnounceEloReset({ ...reset, before: 0 }, null, now)).toBe(false);
		expect(shouldAnnounceEloReset({ ...reset, resetAt: "2026-06-05T10:00:00Z" }, null, now)).toBe(false);
		expect(shouldAnnounceEloReset({ ...reset, resetAt: "garbage" }, null, now)).toBe(false);
	});
});

describe("season history helpers", () => {
	it("orders titles by best rank, then newest season", () => {
		const sorted = sortSeasonTitles([
			{ seasonKey: "2026-08", board: "classic", rank: 3 },
			{ seasonKey: "2026-09", board: "chaos", rank: 1 },
			{ seasonKey: "2026-09", board: "elo", rank: 3 },
		]);
		expect(sorted.map((title) => `${title.seasonKey}:${title.board}`)).toEqual([
			"2026-09:chaos",
			"2026-09:elo",
			"2026-08:classic",
		]);
	});

	it("maps result rows to leaderboard rows", () => {
		const rows = toLeaderboardRows([{ rank: 1, playerName: "Ann", score: 4200, profileId: "p1" }], "classic");
		expect(rows).toEqual([{ player_name: "Ann", score: 4200, game_mode: "classic" }]);
	});
});
