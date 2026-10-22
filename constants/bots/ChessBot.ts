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

function search(chess: Chess, depth: number, alpha: number, beta: number, ply: number): number {
	if (depth === 0) return evaluate(chess);
	const moves = orderedMoves(chess);
	if (moves.length === 0) return chess.inCheck() ? -MATE + ply : 0;

	let best = -Infinity;
	for (const move of moves) {
		chess.move({ from: move.from, to: move.to, promotion: move.promotion });
		const score = -search(chess, depth - 1, -beta, -alpha, ply + 1);
		chess.undo();
		if (score > best) best = score;
		if (best > alpha) alpha = best;
		if (alpha >= beta) break;
	}
	return best;
}

const DEPTH: Record<BotDifficulty, number> = { easy: 1, medium: 2, hard: 3 };

/** Scores every legal move at the level's depth. Higher is better for the side to move. */
function scoreMoves(chess: Chess, depth: number): { move: Verbose; score: number }[] {
	const result: { move: Verbose; score: number }[] = [];
	for (const move of orderedMoves(chess)) {
		chess.move({ from: move.from, to: move.to, promotion: move.promotion });
		const score = -search(chess, depth - 1, -Infinity, Infinity, 1);
		chess.undo();
		result.push({ move, score });
	}
	return result.sort((a, b) => b.score - a.score);
}

/**
 * Picks the bot's move for the position (FEN). Returns null when there is no legal move.
 *  - easy: often plays a random legal move, otherwise the best move one ply ahead
 *  - medium: two plies, now and then one of the three best moves instead of the best
 *  - hard: three plies, always the best move found
 */
export function chooseChessMove(fen: string, difficulty: BotDifficulty, rng: Rng = Math.random): ChessBotMove | null {
	const chess = new Chess(fen);
	const legal = chess.moves({ verbose: true }) as unknown as Verbose[];
	if (legal.length === 0) return null;

	const toMove = (move: Verbose): ChessBotMove => ({ from: move.from, to: move.to, promotion: move.promotion });

	if (difficulty === "easy" && rng() < 0.4) return toMove(legal[randomInt(rng, legal.length)]);

	const scored = scoreMoves(chess, DEPTH[difficulty]);
	if (difficulty === "medium" && scored.length > 1 && rng() < 0.15) {
		return toMove(pickRandom(rng, scored.slice(0, 3)).move);
	}
	const top = scored[0].score;
	// Equal best moves are picked at random so the bot does not play the same game every time.
	const ties = scored.filter((entry) => entry.score === top);
	return toMove(pickRandom(rng, ties).move);
}
