import { GameModeType } from "@/hooks/useAppState";
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
