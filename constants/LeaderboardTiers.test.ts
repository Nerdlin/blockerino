import { getLeaderboardTier } from "./LeaderboardTiers";

describe("getLeaderboardTier", () => {
	it("maps the podium to gold, silver and bronze", () => {
		expect(getLeaderboardTier(1)?.id).toBe("gold");
		expect(getLeaderboardTier(2)?.id).toBe("silver");
		expect(getLeaderboardTier(3)?.id).toBe("bronze");
	});

	it("maps 4-5 to top5 and 6-10 to top10", () => {
		expect(getLeaderboardTier(4)?.id).toBe("top5");
		expect(getLeaderboardTier(5)?.id).toBe("top5");
		expect(getLeaderboardTier(6)?.id).toBe("top10");
		expect(getLeaderboardTier(10)?.id).toBe("top10");
	});

	it("returns undefined below the top 10 and for invalid ranks", () => {
		expect(getLeaderboardTier(11)).toBeUndefined();
		expect(getLeaderboardTier(0)).toBeUndefined();
		expect(getLeaderboardTier(-3)).toBeUndefined();
		expect(getLeaderboardTier(2.5)).toBeUndefined();
	});
});
