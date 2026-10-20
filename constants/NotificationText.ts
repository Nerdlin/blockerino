import type { AppNotification, NotificationKind } from "./Notifications";

type Translate = (key: string, params?: Record<string, string | number>) => string;

export interface NotificationLines {
	/** Short headline. */
	title: string;
	/** One line with the numbers. */
	detail: string;
}

function num(value: unknown, fallback = 0): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function name(value: unknown, fallback: string): string {
	return typeof value === "string" && value.trim() ? value.trim().slice(0, 30) : fallback;
}

/** The two lines shown in the app for one notification (the push text is built on the server in the same spirit). */
export function describeNotification(notification: AppNotification, t: Translate): NotificationLines {
	const payload = notification.payload;
	const board = name(payload.board, "classic");
	const boardName = t(`perk.board.${board === "chaos" ? "chaos" : "classic"}`);

	if (notification.kind === "overtaken") {
		return {
			title: t("notif.overtaken.title", { by: name(payload.by, t("notif.somebody")) }),
			detail: t("notif.overtaken.detail", { board: boardName, byScore: num(payload.by_score), score: num(payload.score) }),
		};
	}
	if (notification.kind === "streak_risk") {
		return {
			title: t("notif.streak.title", { streak: num(payload.streak) }),
			detail: t("notif.streak.detail", { reward: num(payload.reward) }),
		};
	}
	const rank = num(payload.rank, 1);
	return {
		title: t("notif.season.title"),
		detail: rank <= 10
			? t("notif.season.top", { rank, board: boardName })
			: t("notif.season.gap", { rank, board: boardName, gap: num(payload.to_top10) }),
	};
}

/** Icon (a glyph of the pixel icon set) and accent colour per kind. */
export function notificationStyle(kind: NotificationKind): { glyph: "swap" | "fire" | "crown"; color: string } {
	if (kind === "overtaken") return { glyph: "swap", color: "#FF5A5A" };
	if (kind === "streak_risk") return { glyph: "fire", color: "#FF9F1C" };
	return { glyph: "crown", color: "#FFD700" };
}

/** Rankings are worth opening for these two; a streak reminder is not about the leaderboard. */
export function pointsToRankings(notification: AppNotification): boolean {
	return notification.kind === "overtaken" || notification.kind === "season_ending";
}
