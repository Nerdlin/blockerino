import { BLUNDER_RATE, BotDifficulty, pickRandom, Rng } from "./Difficulty";
import { applyMove, CheckersMove, CheckersState, gameResult, isKing, legalMoves, rowOf, Side, sideOf } from "../checkers/Rules";

// How many plies ahead each level looks. A capture sequence counts as one ply.
const DEPTH: Record<BotDifficulty, number> = { easy: 1, medium: 3, hard: 5 };
const WIN = 100000;

/** Material and position from `side`'s point of view: kings are worth three men, men gain a little as they advance. */
function evaluate(state: CheckersState, side: Side): number {
	let score = 0;
	for (let square = 0; square < 64; square += 1) {
		const piece = state.board[square];
		if (!piece) continue;
		const own = sideOf(piece) === side ? 1 : -1;
		if (isKing(piece)) {
			score += own * 300;
			continue;
		}
		// rows from the man's own back row: 0..7
		const advance = sideOf(piece) === "w" ? 7 - rowOf(square) : rowOf(square);
		score += own * (100 + advance * 4);
	}
	return score;
}

function search(state: CheckersState, depth: number, alpha: number, beta: number, side: Side): number {
	const result = gameResult(state);
	if (result === "draw") return 0;
	// the side to move has lost; a quicker win scores higher
	if (result) return (result === side ? WIN : -WIN) + (result === side ? depth : -depth);
	if (depth === 0) return evaluate(state, side);

	const maximizing = state.turn === side;
	let best = maximizing ? -Infinity : Infinity;
	for (const move of legalMoves(state.board, state.turn)) {
		const value = search(applyMove(state, move), depth - 1, alpha, beta, side);
		if (maximizing) {
			best = Math.max(best, value);
			alpha = Math.max(alpha, value);
		} else {
			best = Math.min(best, value);
			beta = Math.min(beta, value);
		}
		if (beta <= alpha) break;
	}
	return best;
}

/** The move the computer plays for the side to move, or null when it has none. */
export function chooseCheckersMove(state: CheckersState, difficulty: BotDifficulty, rng: Rng = Math.random): CheckersMove | null {
	const moves = legalMoves(state.board, state.turn);
	if (moves.length === 0) return null;
	if (moves.length === 1) return moves[0];
	if (rng() < BLUNDER_RATE[difficulty]) return pickRandom(rng, moves);

	const side = state.turn;
	let bestValue = -Infinity;
	let bestMoves: CheckersMove[] = [];
	for (const move of moves) {
		const value = search(applyMove(state, move), DEPTH[difficulty] - 1, -Infinity, Infinity, side);
		if (value > bestValue) {
			bestValue = value;
			bestMoves = [move];
		} else if (value === bestValue) {
			bestMoves.push(move);
		}
	}
	return pickRandom(rng, bestMoves);
}
