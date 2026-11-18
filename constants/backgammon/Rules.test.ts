import {
	absIndex, applySingle, applyTurn, BackgammonState, BgMove, canMoveChecker, countAt, diceToPlay, flipRel, gameResult,
	initialPosition, initialState, isCompleteTurn, isMoveList, isValidState, legalNextMoves, legalTurns, makesForbiddenBlock,
	movesThisTurn, other, pipCount, Position, positionAfter, relOf, remainingDice, rollDice, Side, withDice,
} from "./Rules";

const seeded = (seed: number) => () => {
	seed = (seed * 1664525 + 1013904223) % 4294967296;
	return seed / 4294967296;
};

/** A position from absolute point numbers (white's numbering, 1..24): `{ 24: 14, 8: 1 }` is fourteen on 24 and one on 8. */
function pos(white: Record<number, number>, black: Record<number, number>, off = { w: 0, b: 0 }): Position {
	const points = Array(24).fill(0);
	for (const [point, count] of Object.entries(white)) points[Number(point) - 1] += count;
	for (const [point, count] of Object.entries(black)) points[Number(point) - 1] -= count;
	return { points, off };
}

const stateOf = (position: Position, turn: Side, dice: [number, number] | null, turns = 10): BackgammonState => ({ ...position, turn, dice, opening: null, turns });

/** A white head in the first turn, the usual black head. */
const start = (dice: [number, number], turn: Side = "w") => stateOf(initialPosition(), turn, dice, 0);

/** Plays any legal turn by picking a random continuation each time. */
function randomTurn(state: BackgammonState, rng: () => number): BgMove[] {
	const played: BgMove[] = [];
	for (;;) {
		const options = legalNextMoves(state, played);
		if (options.length === 0) return played;
		played.push(options[Math.floor(rng() * options.length)]);
	}
}

describe("long backgammon board", () => {
	it("starts with fifteen checkers of each side on its head, 360 pips each", () => {
		const position = initialPosition();
		expect(countAt(position, "w", 24)).toBe(15);
		expect(countAt(position, "b", 24)).toBe(15);
		expect(position.points[23]).toBe(15);
		// black's head is white's point 12
		expect(position.points[11]).toBe(-15);
		expect(pipCount(position, "w")).toBe(360);
		expect(pipCount(position, "b")).toBe(360);
	});

	it("numbers the points for both sides and converts between them", () => {
		for (let rel = 1; rel <= 24; rel += 1) {
			expect(relOf("w", absIndex("w", rel))).toBe(rel);
			expect(relOf("b", absIndex("b", rel))).toBe(rel);
			expect(flipRel(flipRel(rel))).toBe(rel);
		}
		expect(absIndex("b", 24)).toBe(11);
		expect(absIndex("b", 12)).toBe(23);
		expect(absIndex("b", 1)).toBe(12);
		// both sides' route is the same circle: a point one step on for white is one step on for black too
		for (let rel = 2; rel <= 24; rel += 1) {
			const whiteStep = (absIndex("w", rel) - absIndex("w", rel - 1) + 24) % 24;
			const blackStep = (absIndex("b", rel) - absIndex("b", rel - 1) + 24) % 24;
			expect(whiteStep).toBe(1);
			expect(blackStep).toBe(1);
		}
	});

	it("rolls dice from one to six and the opening roll-off never ties", () => {
		for (let seed = 1; seed < 60; seed += 1) {
			const dice = rollDice(seeded(seed));
			expect(dice.every((die) => die >= 1 && die <= 6)).toBe(true);
			const state = initialState(seeded(seed));
			expect(state.opening![0]).not.toBe(state.opening![1]);
			expect(state.turn).toBe(state.opening![0] > state.opening![1] ? "w" : "b");
			expect(state.dice).toBeNull();
			expect(isValidState(state)).toBe(true);
		}
		expect(rollDice(() => 0.9999999)).toEqual([6, 6]);
		expect(rollDice(() => 0)).toEqual([1, 1]);
	});
});

describe("moving", () => {
	it("lets only one checker leave the head on an ordinary turn, and the second die goes on with that checker", () => {
		const state = start([5, 3]);
		const first = legalNextMoves(state);
		expect(first.map((move) => `${move.from}-${move.to}`).sort()).toEqual(["24-19", "24-21"]);
		const turns = legalTurns(state);
		expect(turns).toHaveLength(1);
		expect(countAt(turns[0].position, "w", 24)).toBe(14);
		expect(countAt(turns[0].position, "w", 16)).toBe(1);
		// after one checker left the head the head is closed for the rest of the turn
		const second = legalNextMoves(state, [{ from: 24, to: 19, die: 5 }]);
		expect(second).toEqual([{ from: 19, to: 16, die: 3 }]);
	});

	it("plays 6-6 from two head checkers on the first turn (the 12 point is black's head)", () => {
		const state = start([6, 6]);
		expect(movesThisTurn(state)).toBe(2);
		const turns = legalTurns(state);
		expect(turns).toHaveLength(1);
		expect(countAt(turns[0].position, "w", 18)).toBe(2);
		expect(countAt(turns[0].position, "w", 24)).toBe(13);
	});

	it("plays 4-4 as two checkers two steps each on the first turn", () => {
		const state = start([4, 4]);
		expect(movesThisTurn(state)).toBe(4);
		const turns = legalTurns(state);
		expect(turns).toHaveLength(1);
		expect(countAt(turns[0].position, "w", 16)).toBe(2);
	});

	it("plays 3-3 on the first turn with two head checkers: both on 18 or one on 15 and one on 21", () => {
		const state = start([3, 3]);
		expect(movesThisTurn(state)).toBe(4);
		const outcomes = legalTurns(state).map(({ position }) => [18, 21, 15].map((rel) => countAt(position, "w", rel)).join("")).sort();
		expect(outcomes).toEqual(["011", "200"].sort());
	});

	it("gives the two head checkers only on the very first turn", () => {
		// white already moved a checker off the head: 3-3 takes just one more checker from the head
		const position = pos({ 24: 14, 21: 1 }, { 12: 15 });
		const state = stateOf(position, "w", [3, 3]);
		const heads = legalNextMoves(state).filter((move) => move.from === 24);
		expect(heads).toHaveLength(1);
		const afterHead = legalNextMoves(state, [{ from: 24, to: 21, die: 3 }]);
		expect(afterHead.some((move) => move.from === 24)).toBe(false);
	});

	it("does not give 5-5 or 1-1 the head exception", () => {
		for (const die of [5, 2, 1]) {
			const state = start([die, die]);
			const taken: BgMove[] = [{ from: 24, to: 24 - die, die }];
			expect(legalNextMoves(state, taken).some((move) => move.from === 24)).toBe(false);
		}
	});

	it("plays a double four times with one checker when the head is the only checker that can move", () => {
		const state = start([5, 5]);
		expect(movesThisTurn(state)).toBe(4);
		const turns = legalTurns(state);
		expect(turns).toHaveLength(1);
		expect(countAt(turns[0].position, "w", 4)).toBe(1);
	});

	it("does not let a checker land on a point held by the opponent, but lets it jump over", () => {
		const position = pos({ 24: 14, 10: 1 }, { 9: 3, 8: 12 });
		expect(canMoveChecker(position, "w", 10, 1)).toBe(false);
		expect(canMoveChecker(position, "w", 10, 2)).toBe(false);
		expect(canMoveChecker(position, "w", 10, 3)).toBe(true);
	});

	it("lands on its own checkers", () => {
		const position = pos({ 24: 13, 10: 1, 7: 1 }, { 12: 15 });
		expect(canMoveChecker(position, "w", 10, 3)).toBe(true);
	});

	it("moves black along the same circle from its own head", () => {
		const state = stateOf(initialPosition(), "b", [2, 1], 1);
		const moves = legalNextMoves(state);
		expect(moves.map((move) => `${move.from}-${move.to}`).sort()).toEqual(["24-22", "24-23"]);
		const turn = legalTurns(state)[0];
		// black's 24 is white's 12, black's 21 is white's 9
		expect(turn.position.points[8]).toBe(-1);
		expect(turn.position.points[11]).toBe(-14);
	});

	it("passes through the corner: black goes from white's 1 to white's 24", () => {
		const position = pos({ 18: 15 }, { 2: 1, 12: 14 });
		// black's point of white 2 is 14; two pips on is white's 24
		expect(relOf("b", 1)).toBe(14);
		expect(canMoveChecker(position, "b", 14, 2)).toBe(true);
		const after = applySingle(position, "b", { from: 14, to: 12, die: 2 });
		expect(after.points[23]).toBe(-1);
	});
});

describe("using the dice", () => {
	it("makes the player play the larger die when only one can be played", () => {
		// the checker on 8 can go 3 or 5 (not both: bearing off needs all home); the head is shut by black on 19 and 21
		const position = pos({ 24: 14, 8: 1 }, { 19: 5, 21: 5, 12: 5 });
		const state = stateOf(position, "w", [5, 3]);
		expect(movesThisTurn(state)).toBe(1);
		expect(legalNextMoves(state)).toEqual([{ from: 8, to: 3, die: 5 }]);
		// with the 3 the other way round too
		expect(legalNextMoves(stateOf(position, "w", [3, 5]))).toEqual([{ from: 8, to: 3, die: 5 }]);
	});

	it("plays the smaller die when the larger one cannot be played", () => {
		const position = pos({ 24: 14, 8: 1 }, { 19: 5, 21: 5, 3: 5 });
		const state = stateOf(position, "w", [5, 3]);
		expect(movesThisTurn(state)).toBe(1);
		expect(legalNextMoves(state)).toEqual([{ from: 8, to: 5, die: 3 }]);
	});

	it("forces the order of the dice that lets both be played", () => {
		// the checker on 10 with 4-2: the 4 first lands on black's 6, the 2 first (on 8) lets the 4 follow
		const position = pos({ 24: 14, 10: 1 }, { 19: 3, 20: 3, 21: 3, 22: 3, 6: 3 });
		const state = stateOf(position, "w", [4, 2]);
		expect(movesThisTurn(state)).toBe(2);
		expect(legalNextMoves(state)).toEqual([{ from: 10, to: 8, die: 2 }]);
		expect(isCompleteTurn(state, [{ from: 10, to: 8, die: 2 }, { from: 8, to: 4, die: 4 }])).toBe(true);
		expect(isCompleteTurn(state, [{ from: 10, to: 8, die: 2 }])).toBe(false);
	});

	it("has no legal move when everything is shut, and the turn passes", () => {
		// the head can move 1 (23 free) only if free: black holds 23..18 in front of the head; the other checkers have no die
		const position = pos({ 24: 15 }, { 23: 3, 22: 3, 21: 3, 20: 3, 19: 3 });
		const state = stateOf(position, "w", [1, 2], 5);
		expect(movesThisTurn(state)).toBe(0);
		expect(legalNextMoves(state)).toEqual([]);
		expect(isCompleteTurn(state, [])).toBe(true);
		const next = applyTurn(state, []);
		expect(next.turn).toBe("b");
		expect(next.dice).toBeNull();
		expect(next.turns).toBe(6);
		expect(next.points).toEqual(state.points);
	});

	it("reports what is left of the roll", () => {
		expect(diceToPlay([3, 3])).toEqual([3, 3, 3, 3]);
		expect(diceToPlay([6, 2])).toEqual([6, 2]);
		expect(remainingDice([3, 3], [{ from: 24, to: 21, die: 3 }])).toEqual([3, 3, 3]);
		expect(remainingDice([6, 2], [{ from: 24, to: 18, die: 6 }])).toEqual([2]);
	});

	it("rejects a replayed turn that breaks a rule", () => {
		const state = start([5, 3]);
		expect(isCompleteTurn(state, [{ from: 24, to: 19, die: 5 }, { from: 24, to: 21, die: 3 }])).toBe(false);
		expect(isCompleteTurn(state, [{ from: 24, to: 19, die: 5 }, { from: 19, to: 16, die: 3 }])).toBe(true);
		expect(isCompleteTurn(withDice(state, [5, 3]), [{ from: 24, to: 20, die: 4 }])).toBe(false);
	});
});

describe("the six-point block", () => {
	// white holds 23..19 and has a ninth... a checker on the head to put on 18 with a 6
	const white = { 24: 10, 23: 1, 22: 1, 21: 1, 20: 1, 19: 1 };

	it("forbids six points in a row when no opposing checker is ahead of them", () => {
		const position = pos(white, { 12: 15 });
		expect(canMoveChecker(position, "w", 24, 6)).toBe(false);
		const state = stateOf(position, "w", [6, 1]);
		expect(legalNextMoves(state).some((move) => move.from === 24 && move.die === 6)).toBe(false);
	});

	it("allows the block once an opposing checker has passed it", () => {
		// black's checker on white's 15 is black's point 3: ahead of a block that starts at black's 6
		const position = pos(white, { 12: 14, 15: 1 });
		expect(canMoveChecker(position, "w", 24, 6)).toBe(true);
	});

	it("allows it when an opposing checker has been borne off", () => {
		const position = pos(white, { 12: 14, 15: 1 }, { w: 0, b: 0 });
		const borne = pos(white, { 12: 14 }, { w: 0, b: 1 });
		expect(canMoveChecker(position, "w", 24, 6)).toBe(true);
		expect(canMoveChecker(borne, "w", 24, 6)).toBe(true);
	});

	it("does not mind five in a row, or six with a gap", () => {
		// 22..18 is five points (23 is empty)
		expect(canMoveChecker(pos({ 24: 11, 22: 1, 21: 1, 20: 1, 19: 1 }, { 12: 15 }), "w", 24, 6)).toBe(true);
		// the head is a point too: 24 with 23..19 is six
		expect(canMoveChecker(pos({ 24: 11, 23: 1, 22: 1, 21: 1, 20: 1 }, { 12: 15 }), "w", 24, 5)).toBe(false);
		// 23, 22, [21 empty], 20, 19 then 18: the runs are 24..22 and 20..18
		expect(canMoveChecker(pos({ 24: 11, 23: 1, 22: 1, 20: 1, 19: 1 }, { 12: 15 }), "w", 24, 6)).toBe(true);
	});

	it("counts seven and more the same way", () => {
		const position = pos({ 24: 9, 23: 1, 22: 1, 21: 1, 20: 1, 19: 1, 17: 1 }, { 12: 15 });
		// 18 joins 23..19 and 17 into a block of seven
		expect(canMoveChecker(position, "w", 24, 6)).toBe(false);
	});

	it("looks along the opponent's route, which passes the corner between white's 1 and 24", () => {
		// white holds 22, 23, 24 and 1, 2: black goes 3, 2, 1, 24, 23, 22 in a row, so the sixth (white's 3) is a block
		const blocked = pos({ 24: 5, 23: 1, 22: 1, 1: 1, 2: 1, 4: 6 }, { 12: 15 });
		expect(canMoveChecker(blocked, "w", 4, 1)).toBe(false);
		// white's 12 and 13 are not neighbours for black (its head 12 comes after its home 13): eleven to sixteen is no block
		const seam = pos({ 24: 9, 11: 1, 12: 1, 13: 1, 14: 1, 15: 1, 17: 1 }, { 10: 15 });
		expect(canMoveChecker(seam, "w", 17, 1)).toBe(true);
		// ...but white's 13..18 are black's home, six in a row
		const home = pos({ 24: 9, 13: 1, 14: 1, 15: 1, 16: 1, 17: 1, 19: 1 }, { 10: 15 });
		expect(canMoveChecker(home, "w", 19, 1)).toBe(false);
		expect(makesForbiddenBlock(applySingle(home, "w", { from: 19, to: 18, die: 1 }), "w", 18)).toBe(true);
	});

	it("applies to black as well", () => {
		// black holds its 23..19 (white's 11..7) and puts a checker on 18 (white's 6) with a 6 from its head
		const black = { 12: 10, 11: 1, 10: 1, 9: 1, 8: 1, 7: 1 };
		const position = pos({ 24: 15 }, black);
		expect(canMoveChecker(position, "b", 24, 6)).toBe(false);
		expect(canMoveChecker(pos({ 24: 14, 1: 1 }, black), "b", 24, 6)).toBe(true);
	});

	it("is checked after every single move of a turn", () => {
		const position = pos(white, { 12: 15 });
		const state = stateOf(position, "w", [1, 6]);
		// the 1 can still be played; the 6 from the head cannot, before or after it
		expect(legalNextMoves(state).some((move) => move.die === 6 && move.from === 24)).toBe(false);
		const after = legalNextMoves(state, [{ from: 24, to: 23, die: 1 }]);
		expect(after.some((move) => move.die === 6 && move.from === 24)).toBe(false);
	});
});

describe("bearing off", () => {
	const home = (counts: Record<number, number>, off = 0) => pos(counts, { 12: 15 }, { w: off, b: 0 });

	it("is not allowed until every checker is home", () => {
		const position = pos({ 7: 1, 3: 14 }, { 12: 15 });
		expect(canMoveChecker(position, "w", 3, 3)).toBe(false);
		expect(canMoveChecker(position, "w", 3, 6)).toBe(false);
		expect(canMoveChecker(home({ 6: 1, 3: 14 }), "w", 3, 3)).toBe(true);
	});

	it("bears off with the exact die", () => {
		const position = home({ 6: 5, 4: 5, 1: 5 });
		expect(legalNextMoves(stateOf(position, "w", [6, 4])).map((move) => `${move.from}-${move.to}`).sort()).toContain("6-0");
		expect(canMoveChecker(position, "w", 4, 4)).toBe(true);
		expect(canMoveChecker(position, "w", 1, 1)).toBe(true);
	});

	it("bears off from the highest point with a bigger die, only from there", () => {
		const position = home({ 5: 7, 3: 8 });
		// a 6 takes a checker off 5 (the highest), not off 3
		expect(canMoveChecker(position, "w", 5, 6)).toBe(true);
		expect(canMoveChecker(position, "w", 3, 6)).toBe(false);
		// a 4 cannot bear off from 3 while a checker waits on 5
		expect(canMoveChecker(position, "w", 3, 4)).toBe(false);
		// and with nothing above, it can
		expect(canMoveChecker(home({ 3: 15 }), "w", 3, 4)).toBe(true);
	});

	it("moves a checker inside the home with a smaller die", () => {
		const position = home({ 6: 5, 5: 5, 2: 5 });
		expect(canMoveChecker(position, "w", 6, 2)).toBe(true);
		expect(canMoveChecker(position, "w", 6, 1)).toBe(true);
		expect(applySingle(position, "w", { from: 6, to: 4, die: 2 }).points[3]).toBe(1);
	});

	it("counts borne off checkers and finishes the game", () => {
		const position = pos({ 2: 1 }, { 12: 15 }, { w: 14, b: 0 });
		const state = stateOf(position, "w", [2, 2]);
		expect(gameResult(state)).toBeNull();
		expect(legalNextMoves(state)).toContainEqual({ from: 2, to: 0, die: 2 });
		const after = applyTurn(state, [{ from: 2, to: 0, die: 2 }]);
		expect(after.off.w).toBe(15);
		expect(gameResult(after)).toEqual({ winner: "w", mars: true, points: 2 });
		// the winner keeps the turn and nothing more can be played
		expect(after.turn).toBe("w");
		expect(legalNextMoves(withDice(after, [1, 1]))).toEqual([]);
	});

	it("scores a mars only when the loser has borne off nothing", () => {
		const plain = { ...pos({}, { 12: 10 }, { w: 15, b: 5 }) };
		expect(gameResult(plain)).toEqual({ winner: "w", mars: false, points: 1 });
		const mars = { ...pos({}, { 12: 15 }, { w: 15, b: 0 }) };
		expect(gameResult(mars)).toEqual({ winner: "w", mars: true, points: 2 });
		const black = { ...pos({ 5: 15 }, {}, { w: 0, b: 15 }) };
		expect(gameResult(black)).toEqual({ winner: "b", mars: true, points: 2 });
		expect(gameResult(initialPosition())).toBeNull();
	});

	it("makes the player use both dice even in the bear-off: the 1 first, then the 2 takes the checker off", () => {
		const position = pos({ 2: 1 }, { 12: 15 }, { w: 14, b: 0 });
		const state = stateOf(position, "w", [2, 1]);
		expect(movesThisTurn(state)).toBe(2);
		expect(legalNextMoves(state)).toEqual([{ from: 2, to: 1, die: 1 }]);
		expect(legalNextMoves(state, [{ from: 2, to: 1, die: 1 }])).toEqual([{ from: 1, to: 0, die: 2 }]);
	});

	it("plays the last checkers off with a double", () => {
		const position = pos({ 3: 2 }, { 12: 15 }, { w: 13, b: 0 });
		const state = stateOf(position, "w", [3, 3]);
		expect(movesThisTurn(state)).toBe(2);
		const turns = legalTurns(state);
		expect(turns).toHaveLength(1);
		expect(applyTurn(state, turns[0].moves).off.w).toBe(15);
	});
});

describe("turns and state", () => {
	it("swaps the side to move and clears the dice", () => {
		const state = start([5, 3]);
		const turn = legalTurns(state)[0];
		const next = applyTurn(state, turn.moves);
		expect(next.turn).toBe("b");
		expect(next.dice).toBeNull();
		expect(next.turns).toBe(1);
		expect(isValidState(next)).toBe(true);
		expect(positionAfter(state, turn.moves).points).toEqual(next.points);
	});

	it("rolling does not change the board", () => {
		const state = initialState(seeded(3));
		const rolled = withDice(state, [4, 2]);
		expect(rolled.points).toEqual(state.points);
		expect(rolled.dice).toEqual([4, 2]);
		expect(rolled.opening).toBeNull();
	});

	it("validates a state that came over the wire", () => {
		const good = initialState(seeded(1));
		expect(isValidState(good)).toBe(true);
		expect(isValidState(null)).toBe(false);
		expect(isValidState({ ...good, points: good.points.slice(1) })).toBe(false);
		expect(isValidState({ ...good, turn: "x" })).toBe(false);
		expect(isValidState({ ...good, dice: [7, 1] })).toBe(false);
		expect(isValidState({ ...good, dice: [1] })).toBe(false);
		expect(isValidState({ ...good, off: { w: 1, b: 0 } })).toBe(false);
		expect(isValidState({ ...good, off: { w: -1, b: 0 } })).toBe(false);
		expect(isValidState({ ...good, turns: -1 })).toBe(false);
		const stolen = [...good.points];
		stolen[0] = 1;
		expect(isValidState({ ...good, points: stolen })).toBe(false);
		expect(isValidState({ ...good, dice: [3, 4] })).toBe(true);
	});

	it("validates a move list that came over the wire", () => {
		expect(isMoveList([{ from: 24, to: 19, die: 5 }])).toBe(true);
		expect(isMoveList([{ from: 3, to: 0, die: 5 }])).toBe(true);
		expect(isMoveList([{ from: 24, to: 18, die: 5 }])).toBe(false);
		expect(isMoveList([{ from: 25, to: 19, die: 6 }])).toBe(false);
		expect(isMoveList("x")).toBe(false);
		expect(isMoveList([{ from: 1, to: 0, die: 1 }, { from: 1, to: 0, die: 1 }, { from: 1, to: 0, die: 1 }, { from: 1, to: 0, die: 1 }, { from: 1, to: 0, die: 1 }])).toBe(false);
	});

	it("knows the other side", () => {
		expect(other("w")).toBe("b");
		expect(other("b")).toBe("w");
	});
});

/** Every run of six or more of a side's points (along the opponent's route) must have an opposing checker ahead of it. */
function blockViolations(position: Position): string[] {
	const found: string[] = [];
	for (const side of ["w", "b"] as Side[]) {
		const opponent = other(side);
		let run = 0;
		for (let q = 1; q <= 24 + 1; q += 1) {
			const held = q <= 24 && countAt(position, side, flipRel(q)) > 0;
			if (held) {
				run += 1;
				continue;
			}
			if (run >= 6) {
				const low = q - run;
				let ahead = position.off[opponent] > 0;
				for (let a = 1; a < low; a += 1) if (countAt(position, opponent, a) > 0) ahead = true;
				if (!ahead) found.push(`${side} block ${low}..${q - 1}`);
			}
			run = 0;
		}
	}
	return found;
}

describe("whole games with random legal moves", () => {
	it("always finish, keep fifteen checkers a side and never leave a forbidden block", () => {
		const results = { w: 0, b: 0, mars: 0 };
		for (let seed = 1; seed <= 12; seed += 1) {
			const rng = seeded(seed * 101);
			let state = initialState(rng);
			let guard = 0;
			while (!gameResult(state) && guard < 2500) {
				guard += 1;
				state = withDice(state, rollDice(rng));
				const moves = randomTurn(state, rng);
				expect(isCompleteTurn(state, moves)).toBe(true);
				expect(moves.length).toBe(movesThisTurn(state));
				const mover = state.turn;
				state = applyTurn(state, moves);
				expect(isValidState(state)).toBe(true);
				expect(blockViolations(state)).toEqual([]);
				if (gameResult(state)) expect(state.turn).toBe(mover);
			}
			const result = gameResult(state);
			expect(result).not.toBeNull();
			results[result!.winner] += 1;
			if (result!.mars) results.mars += 1;
		}
		expect(results.w + results.b).toBe(12);
	}, 60000);

	it("agrees with itself: every complete turn from legalTurns replays as legal", () => {
		const rng = seeded(77);
		let state = initialState(rng);
		for (let turn = 0; turn < 60 && !gameResult(state); turn += 1) {
			state = withDice(state, rollDice(rng));
			const turns = legalTurns(state);
			if (turns.length === 0) expect(movesThisTurn(state)).toBe(0);
			for (const entry of turns) {
				expect(isCompleteTurn(state, entry.moves)).toBe(true);
				expect(positionAfter(state, entry.moves).points).toEqual(entry.position.points);
			}
			const picked = turns.length ? turns[Math.floor(rng() * turns.length)].moves : [];
			state = applyTurn(state, picked);
		}
	});
});
