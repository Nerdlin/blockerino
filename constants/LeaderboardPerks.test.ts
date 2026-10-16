import { buildPerkMap, getPerkTier, pickBestPerk } from "./LeaderboardPerks";

jest.mock("./Supabase", () => ({ supabase: {}, getTopEloRatings: jest.fn() }));
jest.mock("./SeasonScores", () => ({ getSeasonLeaderboard: jest.fn() }));

describe("getPerkTier", () => {
	it("rewards only the top 5", () => {
		expect(getPerkTier(1)?.id).toBe("gold");
		expect(getPerkTier(3)?.id).toBe("bronze");
		expect(getPerkTier(5)?.id).toBe("top5");
		expect(getPerkTier(6)).toBeUndefined();
		expect(getPerkTier(0)).toBeUndefined();
	});
});

describe("buildPerkMap", () => {
	it("maps each top-5 name to its place, case-insensitively", () => {
		const map = buildPerkMap([{ board: "classic", names: ["Alctraz", "Pod", "Nerdlin"] }]);
		expect(map.get("alctraz")?.[0]).toMatchObject({ board: "classic", rank: 1 });
		expect(map.get("nerdlin")?.[0]).toMatchObject({ board: "classic", rank: 3 });
	});

	it("ignores places below the top 5", () => {
		const map = buildPerkMap([{ board: "classic", names: ["a", "b", "c", "d", "e", "f"] }]);
		expect(map.has("e")).toBe(true);
		expect(map.has("f")).toBe(false);
	});

	it("collects perks from several boards for the same player", () => {
		const map = buildPerkMap([
			{ board: "classic", names: ["Nerdlin", "Grass"] },
			{ board: "elo", names: ["Grass", "Nerdlin"] },
		]);
		expect(map.get("nerdlin")?.map((perk) => [perk.board, perk.rank])).toEqual([["classic", 1], ["elo", 2]]);
	});

	it("counts a duplicated name on one board only once", () => {
		const map = buildPerkMap([{ board: "chaos", names: ["Same", "same", "Other"] }]);
		expect(map.get("same")).toHaveLength(1);
		expect(map.get("other")?.[0].rank).toBe(3);
	});

	it("skips empty names", () => {
		expect(buildPerkMap([{ board: "elo", names: ["", "  "] }]).size).toBe(0);
	});
});

describe("pickBestPerk", () => {
	it("returns the lowest rank across boards", () => {
		const map = buildPerkMap([
			{ board: "classic", names: ["x", "me"] },
			{ board: "elo", names: ["me"] },
		]);
		expect(pickBestPerk(map.get("me"))).toMatchObject({ board: "elo", rank: 1 });
	});

	it("returns undefined when there are no perks", () => {
		expect(pickBestPerk(undefined)).toBeUndefined();
		expect(pickBestPerk([])).toBeUndefined();
	});
});
