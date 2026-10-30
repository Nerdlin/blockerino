import { MATE_CP, accuracy, countGrades, gradeFor, reviewGame, toWhiteCp } from "./Review";

describe("game review", () => {
	it("grades by the loss for the side that moved", () => {
		expect(gradeFor(0, true)).toBe("best");
		expect(gradeFor(40, false)).toBe("good");
		expect(gradeFor(80, false)).toBe("inaccuracy");
		expect(gradeFor(200, false)).toBe("mistake");
		expect(gradeFor(450, false)).toBe("blunder");
	});

	it("turns side-to-move scores into white's view and clamps mates", () => {
		expect(toWhiteCp({ cp: 50 }, "b")).toBe(-50);
		expect(toWhiteCp({ mate: 2 }, "w")).toBe(MATE_CP);
		expect(toWhiteCp({ mate: -1 }, "w")).toBe(-MATE_CP);
	});

	it("measures each move from the mover's side and spots the engine's own choice", () => {
		const moves = reviewGame(
			["e4", "f6", "Qh5+"],
			["e2e4", "f7f6", "d1h5"],
			[
				{ cp: 30, bestMove: "e2e4" },
				{ cp: 35, bestMove: "e7e5" },
				{ cp: 400, bestMove: "d1h5" },
				{ cp: 380, bestMove: "g7g6" },
			],
		);
		expect(moves.map((move) => move.grade)).toEqual(["best", "blunder", "best"]);
		expect(moves[1]).toMatchObject({ mover: "b", loss: 365, better: "e7e5" });
		expect(countGrades(moves, "b").blunder).toBe(1);
		expect(accuracy(moves, "w")).toBeGreaterThan(accuracy(moves, "b"));
	});
});
