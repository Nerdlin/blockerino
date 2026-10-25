import { buildMessage } from "../supabase/functions/send-push/messages";

describe("push message texts", () => {
	it("tells a player who overtook them, in their language", () => {
		const payload = { board: "classic", by: "Rival", by_score: 1500, score: 1200 };
		expect(buildMessage("overtaken", payload, "en")).toEqual({
			title: "You were overtaken!",
			body: "Rival passed your Classic 8×8 score: 1500 vs 1200. Take it back!",
		});
		expect(buildMessage("overtaken", payload, "ru")?.title).toBe("Вас обогнали!");
	});

	it("reminds about a streak with the reward", () => {
		expect(buildMessage("streak_risk", { streak: 6, reward: 110 }, "en")).toEqual({
			title: "Your 6-day streak is at risk",
			body: "Play today and collect +110 coins.",
		});
	});

	it("tells the top 10 to defend and the rest how far the top 10 is", () => {
		expect(buildMessage("season_ending", { board: "chaos", rank: 4, to_top10: 0 }, "en")?.body).toContain("Defend");
		expect(buildMessage("season_ending", { board: "chaos", rank: 12, to_top10: 340 }, "en")?.body).toContain("340 points");
		expect(buildMessage("season_ending", { board: "chaos", rank: 12, to_top10: 340 }, "ru")?.body).toContain("340 очков");
	});

	it("invites a friend to a match, with the host and the mode, in their language", () => {
		expect(buildMessage("invite", { from: "Nina", mode: "chaos" }, "en")).toEqual({
			title: "1v1 invite",
			body: "Nina invites you to a Chaos 10×10 match. Open the game to accept.",
		});
		expect(buildMessage("invite", { mode: "classic" }, "ru")?.body).toContain("Друг");
	});

	it("survives missing or hostile payload values and unknown kinds", () => {
		expect(buildMessage("overtaken", {}, "en")?.body).toContain("A player");
		expect(buildMessage("overtaken", { by: "x".repeat(500), by_score: "NaN" }, "en")?.body.length).toBeLessThan(160);
		expect(buildMessage("brand_new_kind", {}, "en")).toBeNull();
	});
});
