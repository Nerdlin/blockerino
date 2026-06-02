import { ACHIEVEMENT_DEFINITIONS, buildAchievementRows, getDefaultAchievementStats } from "./Achievements";
import { GameModeType } from "@/hooks/useAppState";

describe("achievement helpers", () => {
	it("defines visible achievements for the main menu", () => {
		expect(ACHIEVEMENT_DEFINITIONS.length).toBeGreaterThanOrEqual(6);
		expect(ACHIEVEMENT_DEFINITIONS.every((item) => item.title && item.howToUnlock)).toBe(true);
	});

	it("builds numeric progress from scores and stats", () => {
		const rows = buildAchievementRows(
			[
				{ score: 1200, date: 1, type: GameModeType.Classic },
				{ score: 400, date: 2, type: GameModeType.Chaos },
			],
			{
				...getDefaultAchievementStats(),
				soloGamesFinished: 1,
				totalLinesCleared: 12,
				totalPiecesPlaced: 33,
				secondChancesUsed: 1,
			}
		);

		expect(rows.find((row) => row.id === "first_steps")?.progress.current).toBe(1);
		expect(rows.find((row) => row.id === "score_hunter")?.progress.current).toBe(1200);
		expect(rows.find((row) => row.id === "line_breaker")?.progress.current).toBe(12);
		expect(rows.find((row) => row.id === "comeback")?.progress.current).toBe(1);
	});
});
