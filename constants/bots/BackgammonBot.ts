import { BLUNDER_RATE, BotDifficulty, pickRandom, Rng } from "./Difficulty";
import {
	allHome, applyTurn, BackgammonState, BgMove, countAt, flipRel, HEAD, legalTurns, LegalTurn, other, pipCount, Position, POINTS,
	Side, withDice,
} from "../backgammon/Rules";

// A bot for long backgammon. It lists every legal way to play the roll, scores the position each one leads to with a
// plain heuristic (race, blocking runs along the opponent's route, spread, a stuck head) and plays the best.
//  - easy: often a random turn, otherwise the heuristic seen through a lot of noise
//  - medium: the heuristic with a little noise
//  - hard: the heuristic plus a look at the opponent's reply to the best few turns, within a time budget so a phone
//    never waits long

/** Weight of a run of held points of this length (index = length) in front of the opponent's checkers. */
const RUN_VALUE = [0, 0, 3, 9, 20, 40, 70, 90, 100, 100, 100, 100, 100];

const ALL_ROLLS: { dice: [number, number]; weight: number }[] = (() => {
	const rolls: { dice: [number, number]; weight: number }[] = [];
	for (let a = 1; a <= 6; a += 1) for (let b = a; b <= 6; b += 1) rolls.push({ dice: [a, b], weight: a === b ? 1 : 2 });
	return rolls;
})();

/** Points of `side` in a row (along the opponent's route), counted by how many opposing checkers still have to pass them. */
function blockValue(position: Position, side: Side): number {
	const opponent = other(side);
	// opposing checkers behind a point q (higher q on their route), as a running total from the head down
	let behind = 0;
	const behindAt: number[] = Array(POINTS + 2).fill(0);
	for (let q = POINTS; q >= 1; q -= 1) {
		behindAt[q] = behind;
		behind += countAt(position, opponent, q);
	}
	let value = 0;
	let run = 0;
	for (let q = POINTS; q >= 0; q -= 1) {
		const held = q >= 1 && countAt(position, side, flipRel(q)) > 0;
		if (held) {
			run += 1;
			continue;
		}
		if (run >= 2) {
			// the run covers q+1 .. q+run; the checkers behind it are those above its top point
			const waiting = Math.min(behindAt[q + run], 10);
			value += RUN_VALUE[Math.min(run, RUN_VALUE.length - 1)] * (0.3 + waiting / 10);
		}
		run = 0;
	}
	return value;
}

/** How good `position` is for `side`; bigger is better. */
export function evaluate(position: Position, side: Side): number {
	const opponent = other(side);
	let score = pipCount(position, opponent) - pipCount(position, side);
	score += (blockValue(position, side) - blockValue(position, opponent)) * 0.6;
	// a stuck head: checkers that still have the whole circle to go, and a head the opponent can crowd
	score -= countAt(position, side, HEAD) * 1.2;
	// spread: a few checkers on many points leave more ways to play the next roll
	let spread = 0;
	let stacked = 0;
	for (let rel = 1; rel < HEAD; rel += 1) {
		const count = countAt(position, side, rel);
		if (count > 0) spread += 1;
		if (count > 3 && !(allHome(position, side) && rel <= 6)) stacked += count - 3;
	}
	score += spread * 1.5 - stacked * 1.5;
	return score;
}

function stateAfter(state: BackgammonState, turn: LegalTurn): BackgammonState {
	return applyTurn(state, turn.moves);
}

/** What `side` is worth after the opponent answers `after` with `dice` (it plays what looks best to it). */
function replyValue(after: BackgammonState, side: Side, dice: [number, number]): number {
	if (after.off[side] >= 15) return Infinity;
	const replyState = withDice(after, dice);
	const replies = legalTurns(replyState);
	if (replies.length === 0) return evaluate(after, side);
	const opponent = replyState.turn;
	let best = -Infinity;
	let bestPosition = replies[0].position;
	for (const reply of replies) {
		const score = evaluate(reply.position, opponent);
		if (score > best) {
			best = score;
			bestPosition = reply.position;
		}
	}
	return evaluate(bestPosition, side);
}

export interface BackgammonBotOptions {
	/** Milliseconds the hard bot may spend looking ahead (default 350). */
	budgetMs?: number;
	now?: () => number;
}

/** The moves the computer plays for the side to move with the dice already rolled; [] when it has none. */
export function chooseBackgammonTurn(state: BackgammonState, difficulty: BotDifficulty, rng: Rng = Math.random, options: BackgammonBotOptions = {}): BgMove[] {
	if (!state.dice) return [];
	const turns = legalTurns(state);
	if (turns.length === 0) return [];
	if (turns.length === 1) return turns[0].moves;
	if (rng() < BLUNDER_RATE[difficulty]) return pickRandom(rng, turns).moves;

	const side = state.turn;
	const noise = difficulty === "easy" ? 10 : difficulty === "medium" ? 2 : 0;
	const scored = turns.map((turn) => ({ turn, score: evaluate(turn.position, side) + (noise ? (rng() - 0.5) * 2 * noise : 0) }));
	scored.sort((a, b) => b.score - a.score);
	if (difficulty !== "hard") return scored[0].turn.moves;

	// Every candidate is looked at against the same rolls, roll by roll, so that running out of time
	// never favours the one that happened to be looked at first.
	const now = options.now ?? Date.now;
	const deadline = now() + (options.budgetMs ?? 350);
	const candidates = scored.slice(0, 3).map((entry) => ({ entry, after: stateAfter(state, entry.turn), total: 0 }));
	let weight = 0;
	for (const roll of ALL_ROLLS) {
		if (weight > 0 && now() > deadline) break;
		for (const candidate of candidates) candidate.total += replyValue(candidate.after, side, roll.dice) * roll.weight;
		weight += roll.weight;
	}
	let best = candidates[0];
	let bestValue = -Infinity;
	for (const candidate of candidates) {
		const blended = (candidate.total / weight) * 0.7 + candidate.entry.score * 0.3;
		if (blended > bestValue) {
			bestValue = blended;
			best = candidate;
		}
	}
	return best.entry.turn.moves;
}
