import { describeNotification, pointsToRankings } from "./NotificationText";
import type { AppNotification } from "./Notifications";

// A stand-in translator that shows which key and values were used.
const t = (key: string, params?: Record<string, string | number>) =>
	`${key}${params ? ":" + Object.entries(params).map(([k, v]) => `${k}=${v}`).join(",") : ""}`;

function make(kind: AppNotification["kind"], payload: Record<string, unknown>): AppNotification {
	return { id: 1, kind, payload, createdAt: "" };
}

describe("describeNotification", () => {
	it("names who passed whom, with the board", () => {
		expect(describeNotification(make("overtaken", { board: "chaos", by: "Rival", by_score: 1500, score: 1200 }), t)).toBe(
			"notif.overtaken:by=Rival,board=perk.board.chaos,byScore=1500,score=1200"
		);
	});

	it("falls back to safe values for a damaged payload", () => {
		expect(describeNotification(make("overtaken", { board: "nonsense", by: 5 }), t)).toBe(
			"notif.overtaken:by=notif.somebody,board=perk.board.classic,byScore=0,score=0"
		);
	});

	it("covers streak and season reminders", () => {
		expect(describeNotification(make("streak_risk", { streak: 6, reward: 110 }), t)).toBe("notif.streakRisk:streak=6,reward=110");
		expect(describeNotification(make("season_ending", { board: "classic", rank: 4 }), t)).toContain("notif.seasonTop");
		expect(describeNotification(make("season_ending", { board: "classic", rank: 12, to_top10: 340 }), t)).toBe(
			"notif.seasonGap:rank=12,board=perk.board.classic,gap=340"
		);
	});
});

describe("pointsToRankings", () => {
	it("is true for leaderboard news only", () => {
		expect(pointsToRankings(make("overtaken", {}))).toBe(true);
		expect(pointsToRankings(make("season_ending", {}))).toBe(true);
		expect(pointsToRankings(make("streak_risk", {}))).toBe(false);
	});
});
