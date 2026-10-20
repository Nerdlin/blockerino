import { describeNotification, notificationStyle, pointsToRankings } from "./NotificationText";
import type { AppNotification } from "./Notifications";

// A stand-in translator that shows which key and values were used.
const t = (key: string, params?: Record<string, string | number>) =>
	`${key}${params ? ":" + Object.entries(params).map(([k, v]) => `${k}=${v}`).join(",") : ""}`;

function make(kind: AppNotification["kind"], payload: Record<string, unknown>): AppNotification {
	return { id: 1, kind, payload, createdAt: "" };
}

describe("describeNotification", () => {
	it("names who passed whom, with the board and both scores", () => {
		expect(describeNotification(make("overtaken", { board: "chaos", by: "Rival", by_score: 1500, score: 1200 }), t)).toEqual({
			title: "notif.overtaken.title:by=Rival",
			detail: "notif.overtaken.detail:board=perk.board.chaos,byScore=1500,score=1200",
		});
	});

	it("falls back to safe values for a damaged payload", () => {
		expect(describeNotification(make("overtaken", { board: "nonsense", by: 5 }), t)).toEqual({
			title: "notif.overtaken.title:by=notif.somebody",
			detail: "notif.overtaken.detail:board=perk.board.classic,byScore=0,score=0",
		});
	});

	it("covers streak and season reminders", () => {
		expect(describeNotification(make("streak_risk", { streak: 6, reward: 110 }), t)).toEqual({
			title: "notif.streak.title:streak=6",
			detail: "notif.streak.detail:reward=110",
		});
		expect(describeNotification(make("season_ending", { board: "classic", rank: 4 }), t).detail).toContain("notif.season.top");
		expect(describeNotification(make("season_ending", { board: "classic", rank: 12, to_top10: 340 }), t)).toEqual({
			title: "notif.season.title",
			detail: "notif.season.gap:rank=12,board=perk.board.classic,gap=340",
		});
	});
});

describe("notificationStyle and pointsToRankings", () => {
	it("gives every kind its own icon and colour", () => {
		const styles = (["overtaken", "streak_risk", "season_ending"] as const).map(notificationStyle);
		expect(new Set(styles.map((s) => s.glyph)).size).toBe(3);
		expect(new Set(styles.map((s) => s.color)).size).toBe(3);
	});

	it("opens the rankings for leaderboard news only", () => {
		expect(pointsToRankings(make("overtaken", {}))).toBe(true);
		expect(pointsToRankings(make("season_ending", {}))).toBe(true);
		expect(pointsToRankings(make("streak_risk", {}))).toBe(false);
	});
});
