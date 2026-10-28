import { Chess } from "chess.js";
import { BotDifficulty, pickRandom, randomInt, Rng } from "./Difficulty";

// A small alpha-beta chess engine on top of chess.js (which supplies the rules). It is meant to be a pleasant
// opponent, not a strong one: material plus a little positional sense, searching 1, 2 or 3 plies by level.

export interface ChessBotMove {
	from: string;
	to: string;
	promotion?: string;
}

const VALUES: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const MATE = 100000;

// Small bonus for standing near the centre (pawns and pieces) and a push for advanced pawns.
function positionalBonus(type: string, file: number, rank: number, color: "w" | "b"): number {
	const centre = 3.5 - Math.max(Math.abs(file - 3.5), Math.abs(rank - 3.5)) + 0.5;
	if (type === "p") {
		const advance = color === "w" ? 7 - rank : rank;
		return Math.round(centre * 2 + advance * 3);
	}
	if (type === "n" || type === "b") return Math.round(centre * 6);
	if (type === "q") return Math.round(centre * 2);
	if (type === "k") return 0;
	return 0;
}

/** Score for the side to move: positive is good for them. */
function evaluate(chess: Chess): number {
	let score = 0;
	const board = chess.board();
	for (let rank = 0; rank < 8; rank++) {
		for (let file = 0; file < 8; file++) {
			const piece = board[rank][file];
			if (!piece) continue;
			const value = VALUES[piece.type] + positionalBonus(piece.type, file, rank, piece.color);
			score += piece.color === chess.turn() ? value : -value;
		}
	}
	return score;
}

type Verbose = { from: string; to: string; promotion?: string; captured?: string; san: string; piece: string };

function orderedMoves(chess: Chess): Verbose[] {
	const moves = chess.moves({ verbose: true }) as unknown as Verbose[];
	const weight = (move: Verbose) =>
		(move.captured ? 10 * VALUES[move.captured] - VALUES[move.piece] : 0) + (move.promotion ? 800 : 0) + (move.san.includes("+") ? 50 : 0);
	return moves.sort((a, b) => weight(b) - weight(a));
}

/** Thrown inside the search when the time budget is used up; the caller then keeps the last finished depth. */
class OutOfTime extends Error {}

interface Clock {
	deadline: number;
	nodes: number;
}

function search(chess: Chess, depth: number, alpha: number, beta: number, ply: number, clock: Clock | null): number {
	if (depth === 0) return evaluate(chess);
	if (clock) {
		clock.nodes += 1;
		// looking at the clock is cheap but not free: once every 64 nodes is plenty
		if ((clock.nodes & 63) === 0 && Date.now() > clock.deadline) throw new OutOfTime();
	}
	const moves = orderedMoves(chess);
	if (moves.length === 0) return chess.inCheck() ? -MATE + ply : 0;

	let best = -Infinity;
	for (const move of moves) {
		chess.move({ from: move.from, to: move.to, promotion: move.promotion });
		const score = -search(chess, depth - 1, -beta, -alpha, ply + 1, clock);
		chess.undo();
		if (score > best) best = score;
		if (best > alpha) alpha = best;
		if (alpha >= beta) break;
	}
	return best;
}

const DEPTH: Record<BotDifficulty, number> = { easy: 1, medium: 2, hard: 4 };
/** Thinking time per move; a slow phone then simply searches less deep instead of making the player wait. */
const TIME_BUDGET_MS: Record<BotDifficulty, number> = { easy: 400, medium: 1200, hard: 2200 };

/** Scores every legal move at the given depth. Higher is better for the side to move. */
function scoreMoves(chess: Chess, depth: number, clock: Clock | null): { move: Verbose; score: number }[] {
	const result: { move: Verbose; score: number }[] = [];
	for (const move of orderedMoves(chess)) {
		chess.move({ from: move.from, to: move.to, promotion: move.promotion });
		// a move that mates is always the best one, whatever the depth
		const score = chess.isCheckmate() ? MATE : -search(chess, depth - 1, -Infinity, Infinity, 1, clock);
		chess.undo();
		result.push({ move, score });
	}
	return result.sort((a, b) => b.score - a.score);
}

/** Deepens one ply at a time and keeps the result of the last depth that finished inside the time budget. */
function bestScored(fen: string, maxDepth: number, budgetMs: number): { move: Verbose; score: number }[] {
	let best = scoreMoves(new Chess(fen), 1, null);
	const clock: Clock = { deadline: Date.now() + budgetMs, nodes: 0 };
	for (let depth = 2; depth <= maxDepth; depth++) {
		try {
			// a fresh board for each depth: an aborted search leaves the old one half way through its moves
			best = scoreMoves(new Chess(fen), depth, clock);
		} catch (error) {
			if (error instanceof OutOfTime) break;
			throw error;
		}
	}
	return best;
}

/**
 * Picks the bot's move for the position (FEN). Returns null when there is no legal move.
 *  - easy: often plays a random legal move, otherwise the best move one ply ahead
 *  - medium: up to two plies, now and then one of the three best moves instead of the best
 *  - hard: up to four plies within about two seconds, always the best move found
 */
export function chooseChessMove(fen: string, difficulty: BotDifficulty, rng: Rng = Math.random, options: { timeBudgetMs?: number } = {}): ChessBotMove | null {
	const chess = new Chess(fen);
	const legal = chess.moves({ verbose: true }) as unknown as Verbose[];
	if (legal.length === 0) return null;

	const toMove = (move: Verbose): ChessBotMove => ({ from: move.from, to: move.to, promotion: move.promotion });

	if (difficulty === "easy" && rng() < 0.4) return toMove(legal[randomInt(rng, legal.length)]);

	const scored = bestScored(fen, DEPTH[difficulty], options.timeBudgetMs ?? TIME_BUDGET_MS[difficulty]);
	if (difficulty === "medium" && scored.length > 1 && rng() < 0.15) {
		return toMove(pickRandom(rng, scored.slice(0, 3)).move);
	}
	const top = scored[0].score;
	// Equal best moves are picked at random so the bot does not play the same game every time.
	const ties = scored.filter((entry) => entry.score === top);
	return toMove(pickRandom(rng, ties).move);
}

/** How a bot of a given Elo plays: search depth, how often it just plays a random move, how often it settles for one of the best few. */
export interface EngineParams {
	depth: number;
	/** Chance of a random legal move (a blunder) instead of a searched one. */
	randomMoveChance: number;
	/** Chance of choosing among the best `topN` moves instead of the best one. */
	topPickChance: number;
	topN: number;
	timeBudgetMs: number;
}

// The table is a first calibration, not a measurement: the engine is a small alpha-beta search, so the ladder is
// meant to be monotonic (a higher Elo beats a lower one more often than not), checked by the self-play test.
const ENGINE_LADDER: { upTo: number; params: EngineParams }[] = [
	{ upTo: 450, params: { depth: 1, randomMoveChance: 0.55, topPickChance: 0.3, topN: 4, timeBudgetMs: 200 } },
	{ upTo: 550, params: { depth: 1, randomMoveChance: 0.42, topPickChance: 0.3, topN: 4, timeBudgetMs: 200 } },
	{ upTo: 700, params: { depth: 1, randomMoveChance: 0.28, topPickChance: 0.25, topN: 3, timeBudgetMs: 250 } },
	{ upTo: 850, params: { depth: 1, randomMoveChance: 0.14, topPickChance: 0.2, topN: 3, timeBudgetMs: 250 } },
	{ upTo: 1000, params: { depth: 2, randomMoveChance: 0.14, topPickChance: 0.25, topN: 3, timeBudgetMs: 500 } },
	{ upTo: 1150, params: { depth: 2, randomMoveChance: 0.06, topPickChance: 0.2, topN: 3, timeBudgetMs: 700 } },
	{ upTo: 1250, params: { depth: 2, randomMoveChance: 0.02, topPickChance: 0.12, topN: 3, timeBudgetMs: 900 } },
	{ upTo: 1350, params: { depth: 3, randomMoveChance: 0.01, topPickChance: 0.12, topN: 3, timeBudgetMs: 1200 } },
	{ upTo: 1450, params: { depth: 3, randomMoveChance: 0, topPickChance: 0.06, topN: 2, timeBudgetMs: 1500 } },
	{ upTo: Infinity, params: { depth: 4, randomMoveChance: 0, topPickChance: 0, topN: 1, timeBudgetMs: 2200 } },
];

export function engineParamsForElo(elo: number): EngineParams {
	return (ENGINE_LADDER.find((step) => elo <= step.upTo) ?? ENGINE_LADDER[ENGINE_LADDER.length - 1]).params;
}

/** The move of a bot with the given Elo. Null when the game is over. */
export function chooseChessMoveByElo(fen: string, elo: number, rng: Rng = Math.random, options: { timeBudgetMs?: number } = {}): ChessBotMove | null {
	const chess = new Chess(fen);
	const legal = chess.moves({ verbose: true }) as unknown as Verbose[];
	if (legal.length === 0) return null;
	const params = engineParamsForElo(elo);
	const toMove = (move: Verbose): ChessBotMove => ({ from: move.from, to: move.to, promotion: move.promotion });

	if (rng() < params.randomMoveChance) return toMove(legal[randomInt(rng, legal.length)]);

	const scored = bestScored(fen, params.depth, options.timeBudgetMs ?? params.timeBudgetMs);
	// once the bot searches, it never passes up a mate in one
	if (scored[0].score >= MATE - 1) return toMove(scored[0].move);
	if (params.topN > 1 && scored.length > 1 && rng() < params.topPickChance) {
		return toMove(pickRandom(rng, scored.slice(0, params.topN)).move);
	}
	const top = scored[0].score;
	return toMove(pickRandom(rng, scored.filter((entry) => entry.score === top)).move);
}
