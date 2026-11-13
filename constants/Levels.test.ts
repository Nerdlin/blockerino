jest.mock("@react-native-async-storage/async-storage", () =>
	require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
import { BoardBlockType } from "./Board";
import { LEVELS, countGems, createLevelBoard, getLevel, isLevelGoalMet, levelGoalProgress, nextLevel, starsForWin } from "./Levels";
import { chapterStars, isLevelUnlocked, mergeStars, totalStars } from "./LevelProgress";

jest.mock("./Supabase", () => ({ supabase: { rpc: jest.fn(), auth: { getSession: jest.fn() } } }));

describe("levels", () => {
	it("50 levels in 5 chapters with one limit each", () => {
		expect(LEVELS).toHaveLength(50);
		expect(LEVELS[0].id).toBe("1-1");
		expect(LEVELS[49].id).toBe("5-10");
		for (const level of LEVELS) {
			expect((level.moves === undefined) !== (level.time === undefined)).toBe(true);
			if (level.goal.kind === "gems") expect(level.gems).toBeGreaterThan(0);
		}
		expect(nextLevel(getLevel("1-10")!)?.id).toBe("2-1");
		expect(nextLevel(getLevel("5-10")!)).toBeUndefined();
	});

	it("boards are the same every time, with the gems and blocks asked for and no line almost full", () => {
		for (const level of LEVELS) {
			const a = createLevelBoard(level);
			const b = createLevelBoard(level);
			expect(a.map((row) => row.map((cell) => cell.blockType))).toEqual(b.map((row) => row.map((cell) => cell.blockType)));
			expect(countGems(a)).toBe(level.gems);
			const filled = a.flat().filter((cell) => cell.blockType === BoardBlockType.FILLED).length;
			expect(filled).toBe(level.blocks + level.gems);
			for (let i = 0; i < 8; i++) {
				expect(a[i].filter((cell) => cell.blockType === BoardBlockType.FILLED).length).toBeLessThanOrEqual(6);
				expect(a.filter((row) => row[i].blockType === BoardBlockType.FILLED).length).toBeLessThanOrEqual(6);
			}
		}
	});

	it("goals and progress", () => {
		const score = getLevel("1-1")!;
		expect(isLevelGoalMet(score, { score: 119, lines: 0, bestCombo: 0, gemsLeft: 0 })).toBe(false);
		expect(isLevelGoalMet(score, { score: 120, lines: 0, bestCombo: 0, gemsLeft: 0 })).toBe(true);
		const gems = getLevel("2-1")!;
		expect(isLevelGoalMet(gems, { score: 0, lines: 0, bestCombo: 0, gemsLeft: 1 })).toBe(false);
		expect(isLevelGoalMet(gems, { score: 0, lines: 0, bestCombo: 0, gemsLeft: 0 })).toBe(true);
		expect(levelGoalProgress(gems, { score: 0, lines: 0, bestCombo: 0, gemsLeft: 1 })).toEqual([gems.gems - 1, gems.gems]);
		const combo = getLevel("3-1")!;
		expect(isLevelGoalMet(combo, { score: 0, lines: 9, bestCombo: 2, gemsLeft: 0 })).toBe(true);
	});

	it("stars by the limit left", () => {
		const level = getLevel("1-1")!; // 18 moves
		expect(starsForWin(level, 0)).toBe(1);
		expect(starsForWin(level, 5)).toBe(2);
		expect(starsForWin(level, 9)).toBe(3);
	});

	it("levels open one after another; chapters count stars", () => {
		expect(isLevelUnlocked({}, 1)).toBe(true);
		expect(isLevelUnlocked({}, 2)).toBe(false);
		expect(isLevelUnlocked({ "1-1": 1 }, 2)).toBe(true);
		expect(isLevelUnlocked({ "1-10": 2 }, 11)).toBe(true);
		const stars = { "1-1": 3, "1-2": 1, "2-1": 2 };
		expect(chapterStars(stars, 1)).toEqual({ won: 2, stars: 4, perfect: 1 });
		expect(totalStars(stars)).toBe(6);
		expect(mergeStars({ "1-1": 1, "1-2": 3 }, { "1-1": 2 })).toEqual({ "1-1": 2, "1-2": 3 });
	});
});
