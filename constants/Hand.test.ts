import { GameModeType } from "@/hooks/useAppState";
import { createRandomHand, createSeededHand, getDailyPuzzleKey } from "./Hand";
import { isClassicComplexPiece, isClassicRescuePiece } from "./Piece";

describe("hand generation", () => {
	const originalRandom = Math.random;

	afterEach(() => {
		Math.random = originalRandom;
	});

	it("keeps classic hands free of complex pieces even when randomness asks for hard pieces", () => {
		Math.random = jest.fn(() => 0.99);

		const hand = createRandomHand(3, GameModeType.Classic);

		expect(hand.some((piece) => piece !== null && isClassicRescuePiece(piece))).toBe(true);
		expect(hand.some((piece) => piece !== null && isClassicComplexPiece(piece))).toBe(false);
	});

	it("keeps daily seeded hands free of complex pieces", () => {
		for (let seed = 1; seed <= 200; seed++) {
			const hand = createSeededHand(3, seed);

			expect(hand.some((piece) => piece !== null && isClassicComplexPiece(piece))).toBe(false);
		}
	});

	it("keeps chaos hands dangerous but not overloaded with complex pieces", () => {
		Math.random = jest.fn(() => 0.99);

		const hand = createRandomHand(5, GameModeType.Chaos);

		expect(hand.some((piece) => piece !== null && isClassicRescuePiece(piece))).toBe(true);
		expect(hand.filter((piece) => piece !== null && isClassicComplexPiece(piece)).length).toBeLessThanOrEqual(2);
	});

	it("uses a different daily puzzle key for each calendar day", () => {
		const firstDay = getDailyPuzzleKey(new Date("2026-05-31T10:00:00"));
		const sameDay = getDailyPuzzleKey(new Date("2026-05-31T23:59:59"));
		const nextDay = getDailyPuzzleKey(new Date("2026-06-01T00:00:00"));

		expect(firstDay).toBe(sameDay);
		expect(nextDay).not.toBe(firstDay);
	});
});
