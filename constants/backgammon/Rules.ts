// Long backgammon (длинные нарды). 24 points, 15 checkers a side. Each side counts the points on its own route from 24
// (its head, where all 15 start) down to 1; its home is 1..6. White's point p is the absolute point p; black's head
// stands opposite white's (white's 12), so black's point q is white's ((q + 11) % 24) + 1. Both sides move the same way
// round the board (counter-clockwise).
//
// Rules:
// - a checker lands on an empty point or on its own checkers; a single opposing checker holds a point (no hitting);
// - one checker may leave the head per turn; on a side's very first turn (all 15 still on the head) 6-6, 4-4 and 3-3
//   let two leave, since one could not use the roll;
// - doubles are played four times;
// - as many dice as possible must be used; when only one of two different dice can be used, it must be the larger
//   one if that one can be played;
// - no move may build six points in a row (along the opponent's route) in front of which no opposing checker
//   stands: such a block would shut the opponent in. A block with an opposing checker already past it (or borne
//   off) is allowed. Every single move is checked, not only the end of the turn;
// - checkers are borne off once all 15 are home: a die takes one off its own point, or off the highest point when
//   the die is bigger than every occupied point;
// - the first side to bear off all 15 wins; a loser who has borne off none suffers a mars (2 points), otherwise 1.

export type Side = "w" | "b";

export const CHECKERS_PER_SIDE = 15;
export const HEAD = 24;
export const POINTS = 24;
export const HOME_TOP = 6;
export const BLOCK_LENGTH = 6;
/** First-turn doubles that let two checkers leave the head. */
const HEAD_EXCEPTION_DICE = [6, 4, 3];

export interface Position {
	/** Index i is white's point i + 1: positive counts are white checkers, negative are black. */
	points: number[];
	off: { w: number; b: number };
}

export interface BackgammonState extends Position {
	turn: Side;
	/** This turn's dice, null until the side to move rolls. */
	dice: [number, number] | null;
	/** The roll-off that chose who starts (white's die, black's die); shown before the first roll. */
	opening: [number, number] | null;
	/** Turns played so far (both sides). */
	turns: number;
}

/** One checker moved by one die. `from` and `to` are on the mover's own route; `to` 0 is borne off. */
export interface BgMove {
	from: number;
	to: number;
	die: number;
}

export interface GameResult {
	winner: Side;
	/** The loser had borne off nothing. */
	mars: boolean;
	points: 1 | 2;
}

export type Rng = () => number;

export const other = (side: Side): Side => (side === "w" ? "b" : "w");

/** Array index of `side`'s point `rel` (1..24). */
export function absIndex(side: Side, rel: number): number {
	return side === "w" ? rel - 1 : (rel + 11) % 24;
}

/** `side`'s own number (1..24) of the point at array index `index`. */
export function relOf(side: Side, index: number): number {
	return side === "w" ? index + 1 : ((index + 12) % 24) + 1;
}

/** The opponent's number of a point that is `rel` on one side's route (the same formula both ways). */
export const flipRel = (rel: number) => ((rel + 11) % 24) + 1;

export function countAt(position: Position, side: Side, rel: number): number {
	const value = position.points[absIndex(side, rel)];
	return side === "w" ? Math.max(0, value) : Math.max(0, -value);
}

export function initialPosition(): Position {
	const points = Array(POINTS).fill(0);
	points[absIndex("w", HEAD)] = CHECKERS_PER_SIDE;
	points[absIndex("b", HEAD)] = -CHECKERS_PER_SIDE;
	return { points, off: { w: 0, b: 0 } };
}

export const rollDie = (rng: Rng = Math.random) => Math.min(6, 1 + Math.floor(rng() * 6));
export const rollDice = (rng: Rng = Math.random): [number, number] => [rollDie(rng), rollDie(rng)];

/** A new game: both heads full, the side with the higher roll-off die moves first (and rolls afresh). */
export function initialState(rng: Rng = Math.random): BackgammonState {
	let w = rollDie(rng);
	let b = rollDie(rng);
	for (let guard = 0; w === b && guard < 50; guard += 1) {
		w = rollDie(rng);
		b = rollDie(rng);
	}
	if (w === b) w = b === 6 ? 5 : b + 1;
	return { ...initialPosition(), turn: w > b ? "w" : "b", dice: null, opening: [w, b], turns: 0 };
}

/** Pips `side` still has to travel (each checker counts its point number). */
export function pipCount(position: Position, side: Side): number {
	let total = 0;
	for (let rel = 1; rel <= POINTS; rel += 1) total += rel * countAt(position, side, rel);
	return total;
}

export function allHome(position: Position, side: Side): boolean {
	for (let rel = HOME_TOP + 1; rel <= POINTS; rel += 1) if (countAt(position, side, rel) > 0) return false;
	return true;
}

/** The dice to play: four of a double, otherwise the two. */
export function diceToPlay(dice: [number, number]): number[] {
	return dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [dice[0], dice[1]];
}

/** The dice of the roll that are still unplayed after `played`. */
export function remainingDice(dice: [number, number], played: BgMove[]): number[] {
	const left = diceToPlay(dice);
	for (const move of played) {
		const index = left.indexOf(move.die);
		if (index >= 0) left.splice(index, 1);
	}
	return left;
}

/** How many checkers may leave the head this turn. */
export function headLimit(position: Position, side: Side, dice: [number, number]): number {
	const firstTurn = countAt(position, side, HEAD) === CHECKERS_PER_SIDE;
	return firstTurn && dice[0] === dice[1] && HEAD_EXCEPTION_DICE.includes(dice[0]) ? 2 : 1;
}

export function applySingle(position: Position, side: Side, move: BgMove): Position {
	const points = [...position.points];
	const sign = side === "w" ? 1 : -1;
	points[absIndex(side, move.from)] -= sign;
	const off = { ...position.off };
	if (move.to <= 0) off[side] += 1;
	else points[absIndex(side, move.to)] += sign;
	return { points, off };
}

/**
 * Whether the checker just placed on `rel` makes a block of six or more points in a row (counted along the
 * opponent's route) with no opposing checker in front of it. `position` already has the checker on `rel`.
 */
export function makesForbiddenBlock(position: Position, side: Side, rel: number): boolean {
	const opponent = other(side);
	// on the opponent's route, point q is our point flipRel(q)
	const held = (q: number) => q >= 1 && q <= POINTS && countAt(position, side, flipRel(q)) > 0;
	const q = flipRel(rel);
	if (!held(q)) return false;
	let low = q;
	let high = q;
	while (held(low - 1)) low -= 1;
	while (held(high + 1)) high += 1;
	if (high - low + 1 < BLOCK_LENGTH) return false;
	// an opposing checker already past the block (nearer its home, or borne off) keeps the block legal
	if (position.off[opponent] > 0) return false;
	for (let ahead = 1; ahead < low; ahead += 1) if (countAt(position, opponent, ahead) > 0) return false;
	return true;
}

/** Whether `side` may move a checker from `from` with `die` (the head rule aside). */
export function canMoveChecker(position: Position, side: Side, from: number, die: number): boolean {
	if (from < 1 || from > POINTS || countAt(position, side, from) === 0) return false;
	const to = from - die;
	if (to >= 1) {
		// the opponent counts the same point as flipRel(to)
		if (countAt(position, other(side), flipRel(to)) > 0) return false;
		// landing on a point that is already ours changes no block
		if (countAt(position, side, to) > 0) return true;
		return !makesForbiddenBlock(applySingle(position, side, { from, to, die }), side, to);
	}
	if (!allHome(position, side)) return false;
	if (to === 0) return true;
	// a bigger die bears off from the highest occupied point only
	for (let rel = from + 1; rel <= HOME_TOP; rel += 1) if (countAt(position, side, rel) > 0) return false;
	return true;
}

interface Node {
	position: Position;
	dice: number[];
	headLeft: number;
}

const positionKey = (position: Position) => `${position.points.join(",")}|${position.off.w},${position.off.b}`;
const nodeKey = (node: Node) => `${positionKey(node.position)}|${[...node.dice].sort().join("")}|${node.headLeft}`;

function children(node: Node, side: Side): { move: BgMove; node: Node }[] {
	const out: { move: BgMove; node: Node }[] = [];
	const dieValues = [...new Set(node.dice)];
	for (const die of dieValues) {
		for (let from = POINTS; from >= 1; from -= 1) {
			if (from === HEAD && node.headLeft <= 0) continue;
			if (!canMoveChecker(node.position, side, from, die)) continue;
			const move: BgMove = { from, to: Math.max(0, from - die), die };
			const dice = [...node.dice];
			dice.splice(dice.indexOf(die), 1);
			out.push({ move, node: { position: applySingle(node.position, side, move), dice, headLeft: from === HEAD ? node.headLeft - 1 : node.headLeft } });
		}
	}
	return out;
}

function maxPlayable(node: Node, side: Side, memo: Map<string, number>): number {
	if (node.dice.length === 0) return 0;
	const key = nodeKey(node);
	const known = memo.get(key);
	if (known !== undefined) return known;
	let best = 0;
	for (const child of children(node, side)) {
		best = Math.max(best, 1 + maxPlayable(child.node, side, memo));
		if (best === node.dice.length) break;
	}
	memo.set(key, best);
	return best;
}

/** The analysis of a rolled turn: replays the moves already made and says what may follow. */
class TurnPlan {
	readonly side: Side;
	readonly start: Node;
	readonly memo = new Map<string, number>();
	readonly total: number;
	readonly dice: [number, number];

	constructor(state: BackgammonState) {
		if (!state.dice) throw new Error("dice not rolled");
		this.side = state.turn;
		this.dice = state.dice;
		this.start = { position: { points: state.points, off: state.off }, dice: diceToPlay(state.dice), headLeft: headLimit(state, state.turn, state.dice) };
		this.total = maxPlayable(this.start, this.side, this.memo);
	}

	/** The legal continuations of `node` after `played` moves. */
	next(node: Node, played: number): { move: BgMove; node: Node }[] {
		const need = this.total - played;
		if (need <= 0) return [];
		let options = children(node, this.side).filter((child) => 1 + maxPlayable(child.node, this.side, this.memo) >= need);
		// only one die can be used: the larger one when it can be
		if (this.total === 1 && this.dice[0] !== this.dice[1]) {
			const larger = Math.max(...this.dice);
			if (options.some((child) => child.move.die === larger)) options = options.filter((child) => child.move.die === larger);
		}
		return options;
	}
}

// A state is never changed in place, so the analysis of its roll can be kept while the board asks about it move by move.
const plans = new WeakMap<BackgammonState, TurnPlan>();
function planOf(state: BackgammonState): TurnPlan {
	let plan = plans.get(state);
	if (!plan) {
		plan = new TurnPlan(state);
		plans.set(state, plan);
	}
	return plan;
}

/** Replays `played` from the turn's start; null when one of them is not a legal continuation. */
function replay(plan: TurnPlan, played: BgMove[]): Node | null {
	let node = plan.start;
	for (let index = 0; index < played.length; index += 1) {
		const wanted = played[index];
		const found = plan.next(node, index).find(({ move }) => move.from === wanted.from && move.die === wanted.die);
		if (!found) return null;
		node = found.node;
	}
	return node;
}

/** The single moves the side to move may make next, after `played` moves of this turn. Empty when the turn is over. */
export function legalNextMoves(state: BackgammonState, played: BgMove[] = []): BgMove[] {
	if (!state.dice || gameResult(state)) return [];
	const plan = planOf(state);
	const node = replay(plan, played);
	if (!node) return [];
	return plan.next(node, played.length).map(({ move }) => move);
}

/** How many dice the rolled turn uses in all. */
export function movesThisTurn(state: BackgammonState): number {
	return state.dice && !gameResult(state) ? planOf(state).total : 0;
}

/** Whether `played` is a whole legal turn for the rolled dice. */
export function isCompleteTurn(state: BackgammonState, played: BgMove[]): boolean {
	if (!state.dice || gameResult(state)) return false;
	const plan = planOf(state);
	return played.length === plan.total && replay(plan, played) !== null;
}

/** The position after some moves of the current turn (no checks). */
export function positionAfter(state: BackgammonState, played: BgMove[]): Position {
	let position: Position = { points: state.points, off: state.off };
	for (const move of played) position = applySingle(position, state.turn, move);
	return position;
}

export interface LegalTurn {
	moves: BgMove[];
	position: Position;
}

/** Every distinct outcome of the rolled turn (one move list per resulting position). */
export function legalTurns(state: BackgammonState): LegalTurn[] {
	if (!state.dice || gameResult(state)) return [];
	const plan = new TurnPlan(state);
	const seen = new Set<string>();
	const out: LegalTurn[] = [];
	const visited = new Set<string>();
	const walk = (node: Node, moves: BgMove[]) => {
		const options = plan.next(node, moves.length);
		if (options.length === 0) {
			const key = positionKey(node.position);
			if (!seen.has(key)) {
				seen.add(key);
				out.push({ moves, position: node.position });
			}
			return;
		}
		for (const option of options) {
			const key = `${moves.length}|${nodeKey(option.node)}`;
			if (visited.has(key)) continue;
			visited.add(key);
			walk(option.node, [...moves, option.move]);
		}
	};
	walk(plan.start, []);
	return out;
}

/** The state after the side to move rolled. */
export function withDice(state: BackgammonState, dice: [number, number]): BackgammonState {
	return { ...state, dice, opening: null };
}

/** Ends the turn with the moves made (the caller checks them with isCompleteTurn); the other side rolls next. */
export function applyTurn(state: BackgammonState, moves: BgMove[]): BackgammonState {
	const position = positionAfter(state, moves);
	const finished = position.off[state.turn] >= CHECKERS_PER_SIDE;
	return { ...position, turn: finished ? state.turn : other(state.turn), dice: null, opening: null, turns: state.turns + 1 };
}

export function gameResult(position: Position): GameResult | null {
	for (const winner of ["w", "b"] as Side[]) {
		if (position.off[winner] >= CHECKERS_PER_SIDE) {
			const mars = position.off[other(winner)] === 0;
			return { winner, mars, points: mars ? 2 : 1 };
		}
	}
	return null;
}

const isDie = (value: unknown) => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 6;

/** A state that came over the wire: the right shape, 15 checkers of each colour, nothing impossible. */
export function isValidState(value: unknown): value is BackgammonState {
	const state = value as BackgammonState | null;
	if (!state || typeof state !== "object") return false;
	if (!Array.isArray(state.points) || state.points.length !== POINTS || !state.points.every((n) => Number.isInteger(n) && Math.abs(n) <= CHECKERS_PER_SIDE)) return false;
	if (!state.off || !Number.isInteger(state.off.w) || !Number.isInteger(state.off.b)) return false;
	if (state.off.w < 0 || state.off.b < 0 || state.off.w > CHECKERS_PER_SIDE || state.off.b > CHECKERS_PER_SIDE) return false;
	if (state.turn !== "w" && state.turn !== "b") return false;
	if (state.dice !== null && !(Array.isArray(state.dice) && state.dice.length === 2 && state.dice.every(isDie))) return false;
	if (state.opening != null && !(Array.isArray(state.opening) && state.opening.length === 2 && state.opening.every(isDie))) return false;
	if (!Number.isInteger(state.turns) || state.turns < 0) return false;
	const white = state.points.reduce((sum, n) => sum + Math.max(0, n), 0) + state.off.w;
	const black = state.points.reduce((sum, n) => sum + Math.max(0, -n), 0) + state.off.b;
	return white === CHECKERS_PER_SIDE && black === CHECKERS_PER_SIDE;
}

/** A move list that came over the wire: a short list of whole numbers on the board. */
export function isMoveList(value: unknown): value is BgMove[] {
	return Array.isArray(value) && value.length <= 4 && value.every((move) => move
		&& Number.isInteger(move.from) && move.from >= 1 && move.from <= POINTS
		&& Number.isInteger(move.to) && move.to >= 0 && move.to < POINTS
		&& Number.isInteger(move.die) && move.die >= 1 && move.die <= 6
		&& move.to === Math.max(0, move.from - move.die));
}
