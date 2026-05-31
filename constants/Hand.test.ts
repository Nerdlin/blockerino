import { GameModeType } from "@/hooks/useAppState";
import { createRandomHand, getDailyPuzzleKey } from "./Hand";
import { isClassicComplexPiece, isClassicRescuePiece } from "./Piece";

describe("hand generation", () => {
	const originalRandom = Math.random;

	afterEach(() => {
		Math.random = originalRandom;
	});

	it("keeps classic hands fair even when randomness keeps asking for hard pieces", () => {
		Math.random = jest.fn(() => 0.99);

		const hand = createRandomHand(3, GameModeType.Classic);

		expect(hand.some((piece) => piece !== null && isClassicRescuePiece(piece))).toBe(true);
		expect(hand.filter((piece) => piece !== null && isClassicComplexPiece(piece)).length).toBeLessThanOrEqual(1);
	});

	it("leaves chaos hands unrestricted", () => {
		Math.random = jest.fn(() => 0.99);

		const hand = createRandomHand(5, GameModeType.Chaos);

		expect(hand.filter((piece) => piece !== null && isClassicComplexPiece(piece)).length).toBeGreaterThan(1);
	});

	it("uses a different daily puzzle key for each calendar day", () => {
		const firstDay = getDailyPuzzleKey(new Date("2026-05-31T10:00:00"));
		const sameDay = getDailyPuzzleKey(new Date("2026-05-31T23:59:59"));
		const nextDay = getDailyPuzzleKey(new Date("2026-06-01T00:00:00"));

		expect(firstDay).toBe(sameDay);
		expect(nextDay).not.toBe(firstDay);
	});
});
