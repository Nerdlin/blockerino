import { BLUNDER_RATE, BotDifficulty, pickRandom, Rng } from "./Difficulty";

export type Mark = "X" | "O";
export type Cell = Mark | null;

const LINES = [
	[0, 1, 2], [3, 4, 5], [6, 7, 8],
	[0, 3, 6], [1, 4, 7], [2, 5, 8],
	[0, 4, 8], [2, 4, 6],
];

function winnerOf(board: readonly Cell[]): Mark | null {
	for (const [a, b, c] of LINES) {
		if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
	}
	return null;
}

function emptyCells(board: readonly Cell[]): number[] {
	const cells: number[] = [];
	board.forEach((value, index) => {
		if (!value) cells.push(index);
	});
	return cells;
}

const other = (mark: Mark): Mark => (mark === "X" ? "O" : "X");

/** Score from `me`'s point of view with perfect play: positive means a win, faster wins score higher. */
function minimax(board: Cell[], toMove: Mark, me: Mark, depth: number): number {
	const winner = winnerOf(board);
	if (winner) return winner === me ? 10 - depth : depth - 10;
	const cells = emptyCells(board);
	if (cells.length === 0) return 0;

	let best = toMove === me ? -Infinity : Infinity;
	for (const index of cells) {
		board[index] = toMove;
		const score = minimax(board, other(toMove), me, depth + 1);
		board[index] = null;
		best = toMove === me ? Math.max(best, score) : Math.min(best, score);
	}
	return best;
}

/** Every move that is as good as any other with perfect play (so the hard bot varies a little but never errs). */
const perfectCache = new Map<string, number[]>();

function perfectMoves(board: readonly Cell[], mark: Mark): number[] {
	const cacheKey = board.map((cell) => cell ?? "-").join("") + mark;
	const cached = perfectCache.get(cacheKey);
	if (cached) return cached;
	const work = [...board];
	let bestScore = -Infinity;
	let bestMoves: number[] = [];
	for (const index of emptyCells(board)) {
		work[index] = mark;
		const score = minimax(work, other(mark), mark, 1);
		work[index] = null;
		if (score > bestScore) {
			bestScore = score;
			bestMoves = [index];
		} else if (score === bestScore) {
			bestMoves.push(index);
		}
	}
	perfectCache.set(cacheKey, bestMoves);
	return bestMoves;
}

/** A cell that finishes a line for `mark`, if there is one. */
function completingMove(board: readonly Cell[], mark: Mark): number | null {
	for (const index of emptyCells(board)) {
		const work = [...board];
		work[index] = mark;
		if (winnerOf(work) === mark) return index;
	}
	return null;
}

/** Wins when it can, blocks when it must, otherwise prefers the centre, then corners, then edges. */
function sensibleMove(board: readonly Cell[], mark: Mark, rng: Rng): number {
	const win = completingMove(board, mark);
	if (win !== null) return win;
	const block = completingMove(board, other(mark));
	if (block !== null) return block;
	const free = emptyCells(board);
	if (free.includes(4)) return 4;
	const corners = free.filter((index) => [0, 2, 6, 8].includes(index));
	return pickRandom(rng, corners.length > 0 ? corners : free);
}

/**
 * Picks the cell the bot plays. Returns -1 when the board is full.
 *  - easy: mostly random, sometimes sensible
 *  - medium: sensible, with the occasional careless move
 *  - hard: perfect play (it cannot be beaten)
 */
export function chooseTicTacToeMove(board: readonly Cell[], mark: Mark, difficulty: BotDifficulty, rng: Rng = Math.random): number {
	const free = emptyCells(board);
	if (free.length === 0) return -1;
	if (difficulty === "hard") return pickRandom(rng, perfectMoves(board, mark));
	if (rng() < BLUNDER_RATE[difficulty]) return pickRandom(rng, free);
	return sensibleMove(board, mark, rng);
}
