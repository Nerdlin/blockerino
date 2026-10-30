jest.mock("@react-native-async-storage/async-storage", () => ({ getItem: jest.fn(), setItem: jest.fn() }));

import { answerPuzzle, nextPuzzleRating, parsePuzzles, pickPuzzle, startPuzzle } from "./Puzzles";

// Scholar's mate set-up: Black blunders with ...Nf6, White mates with Qxf7#.
const [mateInOne] = parsePuzzles([
	["test1", "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3", "g8f6 h5f7", 600, ["mateIn1"]],
]);

describe("chess puzzles", () => {
	it("plays the opponent's setup move first and hands the move to the player", () => {
		const position = startPuzzle(mateInOne);
		expect(position.playerColor).toBe("w");
		expect(position.history).toEqual(["Nf6"]);
		expect(position.step).toBe(1);
	});

	it("accepts the solution, rejects other moves and illegal ones", () => {
		const position = startPuzzle(mateInOne);
		expect(answerPuzzle(mateInOne, position, "h5f7").result).toBe("solved");
		expect(answerPuzzle(mateInOne, position, "c4f7").result).toBe("wrong");
		expect(answerPuzzle(mateInOne, position, "a1a8").result).toBe("wrong");
	});

	it("plays the reply after a right move that is not the last", () => {
		// a two-move line: 1.e4 e5 2.Nf3 Nc6 from the start, as if it were a puzzle
		const [line] = parsePuzzles([["test2", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "e2e4 e7e5 g1f3 b8c6", 900, []]]);
		const start = startPuzzle(line);
		expect(start.playerColor).toBe("b");
		const first = answerPuzzle(line, start, "e7e5");
		expect(first.result).toBe("correct");
		if (first.result !== "correct") return;
		expect(first.position.history).toEqual(["e4", "e5", "Nf3"]);
		expect(answerPuzzle(line, first.position, "b8c6").result).toBe("solved");
	});

	it("moves the puzzle rating like Elo and keeps it in range", () => {
		expect(nextPuzzleRating(800, 800, true)).toBe(816);
		expect(nextPuzzleRating(800, 800, false)).toBe(784);
		expect(nextPuzzleRating(400, 2000, false)).toBe(400);
	});

	it("picks an unsolved puzzle close to the rating", () => {
		const pool = parsePuzzles([
			["a", "8/8/8/8/8/8/8/8 w - - 0 1", "a1a2", 500, []],
			["b", "8/8/8/8/8/8/8/8 w - - 0 1", "a1a2", 1500, []],
		]);
		expect(pickPuzzle(pool, 1450, [], () => 0)?.id).toBe("b");
		expect(pickPuzzle(pool, 1450, ["b"], () => 0)?.id).toBe("a");
	});
});
