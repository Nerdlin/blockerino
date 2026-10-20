import type { AppNotification } from "./Notifications";

type Translate = (key: string, params?: Record<string, string | number>) => string;

function num(value: unknown, fallback = 0): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function name(value: unknown, fallback: string): string {
	return typeof value === "string" && value.trim() ? value.trim().slice(0, 30) : fallback;
}

/** The line shown in the app for one notification (the push text is built on the server in the same spirit). */
export function describeNotification(notification: AppNotification, t: Translate): string {
	const payload = notification.payload;
	const board = name(payload.board, "classic");
	const boardName = t(`perk.board.${board === "chaos" ? "chaos" : "classic"}`);

	if (notification.kind === "overtaken") {
		return t("notif.overtaken", {
			by: name(payload.by, t("notif.somebody")),
			board: boardName,
			byScore: num(payload.by_score),
			score: num(payload.score),
		});
	}
	if (notification.kind === "streak_risk") {
		return t("notif.streakRisk", { streak: num(payload.streak), reward: num(payload.reward) });
	}
	const rank = num(payload.rank, 1);
	return rank <= 10
		? t("notif.seasonTop", { rank, board: boardName })
		: t("notif.seasonGap", { rank, board: boardName, gap: num(payload.to_top10) });
}

/** Rankings are worth opening for these two; a streak reminder is not about the leaderboard. */
export function pointsToRankings(notification: AppNotification): boolean {
	return notification.kind === "overtaken" || notification.kind === "season_ending";
}
