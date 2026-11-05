jest.mock("@react-native-async-storage/async-storage", () =>
	require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("./Supabase", () => ({ submitDailyPuzzleScore: jest.fn(() => Promise.resolve(true)) }));

import fs from "fs";
import path from "path";
import { GameModeType } from "@/hooks/useAppState";
import { CHALLENGE_GOALS, countChallengeStars, DAILY_THREE_STAR_COINS, dailyStreak, MAX_CHALLENGE_STARS, nextGoal, puzzleDayKey, starsForScore } from "./ChallengeProgress";

describe("challenge stars", () => {
	it("gives a star per goal reached and names the next goal", () => {
		expect(starsForScore(GameModeType.MoveLimit, 0)).toBe(0);
		expect(starsForScore(GameModeType.MoveLimit, 700)).toBe(2);
		expect(nextGoal(GameModeType.MoveLimit, 700)).toBe(1200);
		expect(nextGoal(GameModeType.MoveLimit, 5000)).toBeNull();
		expect(starsForScore(GameModeType.Classic, 99999)).toBe(0);
	});

	it("adds the stars of every challenge up to fifteen", () => {
		expect(MAX_CHALLENGE_STARS).toBe(15);
		expect(countChallengeStars({ [GameModeType.DailyPuzzle]: 600, [GameModeType.TimeAttack]: 1000 })).toBe(4);
	});
});

describe("Daily Puzzle streak", () => {
	const today = puzzleDayKey(new Date(2026, 10, 5));

	it("counts days in a row ending today or yesterday", () => {
		expect(dailyStreak({ "2026-11-05": 10, "2026-11-04": 5, "2026-11-03": 1, "2026-11-01": 9 }, today)).toBe(3);
		expect(dailyStreak({ "2026-11-04": 5, "2026-11-03": 1 }, today)).toBe(2);
		expect(dailyStreak({ "2026-11-02": 5 }, today)).toBe(0);
	});

	it("crosses month borders", () => {
		expect(dailyStreak({ "2026-11-01": 1, "2026-10-31": 1, "2026-10-30": 1 }, "2026-11-01")).toBe(3);
	});
});

describe("Daily Puzzle three-star reward", () => {
	it("uses the same goal and coins as the server", () => {
		const sql = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20261105100000_achievements_and_daily_board.sql"), "utf8");
		const body = (name: string) => sql.slice(sql.indexOf(`FUNCTION public.${name}()`), sql.indexOf("$$;", sql.indexOf(`FUNCTION public.${name}()`)));
		expect(body("daily_puzzle_three_star_score")).toContain(`SELECT ${CHALLENGE_GOALS[GameModeType.DailyPuzzle][2]} `);
		expect(body("daily_puzzle_reward_coins")).toContain(`SELECT ${DAILY_THREE_STAR_COINS} `);
	});
});
