import { applyTurn, BackgammonState, gameResult, initialState, isCompleteTurn, legalTurns, Position, rollDice, Side, withDice } from "../backgammon/Rules";
import { chooseBackgammonTurn, evaluate } from "./BackgammonBot";
import { BotDifficulty } from "./Difficulty";

const seeded = (seed: number) => () => {
	seed = (seed * 1664525 + 1013904223) % 4294967296;
	return seed / 4294967296;
};

function pos(white: Record<number, number>, black: Record<number, number>, off = { w: 0, b: 0 }): Position {
	const points = Array(24).fill(0);
	for (const [point, count] of Object.entries(white)) points[Number(point) - 1] += count;
	for (const [point, count] of Object.entries(black)) points[Number(point) - 1] -= count;
	return { points, off };
}

/** A fake clock that advances on every look, so the hard bot's time budget is a count of looks, not milliseconds. */
const ticking = () => {
	let time = 0;
	return () => (time += 1);
};

describe("long backgammon bot", () => {
	it("plays nothing without dice or without a legal move", () => {
		const fresh = initialState(seeded(2));
		expect(chooseBackgammonTurn(fresh, "hard", seeded(1))).toEqual([]);
		const shut = { ...pos({ 24: 15 }, { 23: 3, 22: 3, 21: 3, 20: 3, 19: 3 }), turn: "w" as Side, dice: [1, 2] as [number, number], opening: null, turns: 5 };
		expect(chooseBackgammonTurn(shut, "medium", seeded(1))).toEqual([]);
	});

	it("always plays a whole legal turn on every level", () => {
		for (const difficulty of ["easy", "medium", "hard"] as BotDifficulty[]) {
			const rng = seeded(11);
			let state: BackgammonState = initialState(rng);
			for (let turn = 0; turn < 40 && !gameResult(state); turn += 1) {
				state = withDice(state, rollDice(rng));
				const moves = chooseBackgammonTurn(state, difficulty, rng, { budgetMs: 2, now: ticking() });
				expect(isCompleteTurn(state, moves)).toBe(true);
				state = applyTurn(state, moves);
			}
		}
	});

	it("bears off to win when it can", () => {
		const position = pos({ 2: 1 }, { 12: 15 }, { w: 14, b: 0 });
		const state: BackgammonState = { ...position, turn: "w", dice: [2, 2], opening: null, turns: 90 };
		for (const difficulty of ["medium", "hard"] as BotDifficulty[]) {
			const moves = chooseBackgammonTurn(state, difficulty, seeded(3), { budgetMs: 6, now: ticking() });
			expect(applyTurn(state, moves).off.w).toBe(15);
		}
	});

	it("scores blocking points in a row in front of the opponent's checkers", () => {
		// white's four points in a row just ahead of black's head against the same checkers spread out
		const black = { 12: 15 };
		const row = evaluate(pos({ 24: 11, 11: 1, 10: 1, 9: 1, 8: 1 }, black), "w");
		const spread = evaluate(pos({ 24: 11, 11: 1, 9: 1, 7: 1, 5: 1 }, black), "w");
		expect(row).toBeGreaterThan(spread);
		expect(evaluate(pos({ 24: 11, 11: 1, 10: 1, 9: 1, 8: 1 }, black), "b")).toBeLessThan(row);
	});

	it("beats a mover that plays at random", () => {
		let wins = 0;
		const games = 10;
		for (let game = 0; game < games; game += 1) {
			const rng = seeded(500 + game);
			const botIsWhite = game % 2 === 0;
			let state: BackgammonState = initialState(rng);
			let guard = 0;
			while (!gameResult(state) && guard < 3000) {
				guard += 1;
				state = withDice(state, rollDice(rng));
				const botTurn = (state.turn === "w") === botIsWhite;
				let moves;
				if (botTurn) moves = chooseBackgammonTurn(state, "medium", rng);
				else {
					const turns = legalTurns(state);
					moves = turns.length ? turns[Math.floor(rng() * turns.length)].moves : [];
				}
				state = applyTurn(state, moves);
			}
			const result = gameResult(state);
			expect(result).not.toBeNull();
			if ((result!.winner === "w") === botIsWhite) wins += 1;
		}
		expect(wins).toBeGreaterThanOrEqual(7);
	}, 60000);

	it("stays quick: a hard turn keeps to its time budget", () => {
		const rng = seeded(9);
		let state: BackgammonState = initialState(rng);
		let slowest = 0;
		for (let turn = 0; turn < 40 && !gameResult(state); turn += 1) {
			state = withDice(state, rollDice(rng));
			const started = Date.now();
			const moves = chooseBackgammonTurn(state, "hard", rng, { budgetMs: 100 });
			slowest = Math.max(slowest, Date.now() - started);
			state = applyTurn(state, moves);
		}
		// the budget is checked between rolls, so one roll's work may run over it a little
		expect(slowest).toBeLessThan(600);
	});
});
