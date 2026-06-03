jest.mock("@react-native-async-storage/async-storage", () =>
	require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { ACHIEVEMENT_DEFINITIONS, buildAchievementRows, getDefaultAchievementStats } from "./Achievements";
import { GameModeType } from "@/hooks/useAppState";

describe("achievement helpers", () => {
	it("defines visible achievements for the main menu", () => {
		expect(ACHIEVEMENT_DEFINITIONS.length).toBeGreaterThanOrEqual(16);
		expect(ACHIEVEMENT_DEFINITIONS.every((item) => item.title && item.howToUnlock)).toBe(true);
	});

	it("builds numeric progress from scores and stats", () => {
		const rows = buildAchievementRows(
			[
				{ score: 1200, date: 1, type: GameModeType.Classic },
				{ score: 400, date: 2, type: GameModeType.Chaos },
				{ score: 700, date: 3, type: GameModeType.DailyPuzzle },
				{ score: 250, date: 4, type: GameModeType.TimeAttack },
			],
			{
				...getDefaultAchievementStats(),
				soloGamesFinished: 12,
				totalLinesCleared: 120,
				totalPiecesPlaced: 333,
				secondChancesUsed: 3,
			}
		);

		expect(rows.find((row) => row.id === "first_steps")?.progress.current).toBe(12);
		expect(rows.find((row) => row.id === "score_hunter")?.progress.current).toBe(1200);
		expect(rows.find((row) => row.id === "line_breaker")?.progress.current).toBe(120);
		expect(rows.find((row) => row.id === "comeback")?.progress.current).toBe(3);
		expect(rows.find((row) => row.id === "mode_sampler")?.progress.current).toBe(4);
		expect(rows.find((row) => row.id === "score_collector")?.progress.current).toBe(2550);
	});
});
