import { GameModeType } from "@/hooks/useAppState";
import { BoardBlockType, breakLines, createSeededBoard, isBoardEmpty, newEmptyBoard } from "./Board";
import {
	consumeMoveLimitMove,
	getGameModeConfig,
	getInitialMovesRemaining,
	isMoveLimitComplete,
	MOVE_LIMIT_STARTING_MOVES,
} from "./GameModes";

describe("Move Limit mode rules", () => {
	it("starts with 30 moves", () => {
		expect(getInitialMovesRemaining(GameModeType.MoveLimit)).toBe(MOVE_LIMIT_STARTING_MOVES);
		expect(getInitialMovesRemaining(GameModeType.MoveLimit)).toBe(30);
	});

	it("decrements after a successful move", () => {
		expect(consumeMoveLimitMove(GameModeType.MoveLimit, 30)).toBe(29);
		expect(consumeMoveLimitMove(GameModeType.MoveLimit, 1)).toBe(0);
	});

	it("awards bonus moves for line clears and combos", () => {
		expect(consumeMoveLimitMove(GameModeType.MoveLimit, 30, 1, 1)).toBe(30);
		expect(consumeMoveLimitMove(GameModeType.MoveLimit, 30, 1, 2)).toBe(32);
		expect(consumeMoveLimitMove(GameModeType.MoveLimit, 30, 2, 4)).toBe(32);
	});

	it("finishes when no moves remain", () => {
		expect(isMoveLimitComplete(GameModeType.MoveLimit, 1)).toBe(false);
		expect(isMoveLimitComplete(GameModeType.MoveLimit, 0)).toBe(true);
	});

	it("keeps extra chance disabled for clean challenge scores", () => {
		expect(getGameModeConfig(GameModeType.MoveLimit).allowSecondChance).toBe(false);
	});

	it("does not consume moves for non-limited modes", () => {
		expect(consumeMoveLimitMove(GameModeType.Classic, 0)).toBe(0);
		expect(isMoveLimitComplete(GameModeType.Classic, 0)).toBe(false);
	});
});

describe("Rescue and Combo Trial", () => {
	const filled = (board: { blockType: unknown }[][]) => board.flat().filter((cell) => cell.blockType === BoardBlockType.FILLED).length;

	it("start from a pre-filled board without a ready line", () => {
		for (const mode of [GameModeType.Rescue, GameModeType.ComboTrial]) {
			const config = getGameModeConfig(mode);
			for (let i = 0; i < 20; i++) {
				const board = createSeededBoard(config.boardLength, i * 7919 + 1, config.startBoard!.minBlocks, config.startBoard!.maxBlocks);
				const count = filled(board);
				expect(count).toBeGreaterThanOrEqual(config.startBoard!.minBlocks);
				expect(count).toBeLessThanOrEqual(config.startBoard!.maxBlocks);
				expect(breakLines(board)).toBe(0);
			}
		}
	});

	it("make the combo chain stricter and lines worth more", () => {
		const combo = getGameModeConfig(GameModeType.ComboTrial);
		expect(combo.comboResetMoves).toBe(2);
		expect(combo.lineScoreMultiplier).toBe(2);
		expect(getGameModeConfig(GameModeType.Rescue).perfectClearBonus).toBe(300);
	});

	it("detects a fully cleared board", () => {
		expect(isBoardEmpty(newEmptyBoard(8))).toBe(true);
		const board = newEmptyBoard(8);
		board[3][3].blockType = BoardBlockType.FILLED;
		expect(isBoardEmpty(board)).toBe(false);
	});
});
