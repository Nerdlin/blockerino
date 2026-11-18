// A pretend game for the "Share a moment" tests and the sample GIF script: a bot plays the real scoring rules on a
// board and every move goes into a MomentRecorder. Not used by the app.

import { EMPTY_CELL, MomentRecorder, findFullLines, placeMove, type MomentMove } from "./MomentRecorder";

// the six piece colours of the game (constants/Piece.tsx) as 0xRRGGBB
export const PIECE_COLORS = [0xe38f10, 0xba1326, 0x109e28, 0x1438b8, 0x651394, 0x1fa5de];

const SHAPES: number[][][] = [
	[[1]],
	[[1, 1]],
	[[1], [1]],
	[[1, 1, 1]],
	[[1], [1], [1]],
	[[1, 1], [1, 1]],
	[[1, 0], [1, 1]],
	[[1, 1, 1, 1]],
	[[1], [1], [1], [1]],
	[[1, 1, 1], [0, 1, 0]],
	[[1, 1, 1, 1, 1]],
];

function makeRandom(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

function blockCount(matrix: number[][]): number {
	return matrix.reduce((sum, row) => sum + row.reduce((inner, cell) => inner + (cell > 0 ? 1 : 0), 0), 0);
}

/** Plays `moves` greedy moves (the same score formula as the game) and returns every one of them, oldest first. */
export function simulateGame(seed: number, boardLength: number, moves: number): MomentMove[] {
	const random = makeRandom(seed);
	let board: Int32Array = new Int32Array(boardLength * boardLength).fill(EMPTY_CELL);
	// a few blocks to start with so lines come early
	for (let i = 0; i < boardLength * 3; i++) board[Math.floor(random() * board.length)] = PIECE_COLORS[Math.floor(random() * PIECE_COLORS.length)];
	const recorder = new MomentRecorder(boardLength, moves);
	let score = 0;
	let combo = 0;
	let sinceLine = 0;
	for (let step = 0; step < moves; step++) {
		const matrix = SHAPES[Math.floor(random() * SHAPES.length)];
		const color = PIECE_COLORS[Math.floor(random() * PIECE_COLORS.length)];
		let best: { x: number; y: number; value: number } | null = null;
		for (let y = 0; y + matrix.length <= boardLength; y++) {
			for (let x = 0; x + matrix[0].length <= boardLength; x++) {
				let fits = true;
				for (let py = 0; py < matrix.length && fits; py++) for (let px = 0; px < matrix[0].length; px++) if (matrix[py][px] && board[(y + py) * boardLength + x + px] !== EMPTY_CELL) fits = false;
				if (!fits) continue;
				const probe = placeMove({ before: board, matrix, color, x, y, lines: 0, points: 0, score: 0, combo: 0 }, boardLength);
				const lines = findFullLines(probe, boardLength);
				const value = (lines.rows.length + lines.cols.length) * 100 + random() * 10;
				if (!best || value > best.value) best = { x, y, value };
			}
		}
		if (!best) {
			// nowhere to go: a fresh board, like a new game
			board = new Int32Array(boardLength * boardLength).fill(EMPTY_CELL);
			combo = 0;
			continue;
		}
		const before = Int32Array.from(board);
		const placed = placeMove({ before, matrix, color, x: best.x, y: best.y, lines: 0, points: 0, score: 0, combo: 0 }, boardLength);
		const full = findFullLines(placed, boardLength);
		const lines = full.rows.length + full.cols.length;
		let points = blockCount(matrix);
		if (lines > 0) {
			combo += lines;
			sinceLine = 0;
			points += lines * boardLength * (combo / 2) * blockCount(matrix);
		} else if (++sinceLine >= 3) {
			combo = 0;
		}
		score += points;
		for (const y of full.rows) for (let x = 0; x < boardLength; x++) placed[y * boardLength + x] = EMPTY_CELL;
		for (const x of full.cols) for (let y = 0; y < boardLength; y++) placed[y * boardLength + x] = EMPTY_CELL;
		board = placed;
		recorder.record(before, matrix, color, best.x, best.y, lines, points, score, combo);
	}
	return recorder.moves();
}

/** The `count` moves that end at the move with the best combo. */
export function bestMoment(moves: MomentMove[], count: number): MomentMove[] {
	let bestAt = 0;
	moves.forEach((move, i) => {
		if (move.combo > moves[bestAt].combo || (move.combo === moves[bestAt].combo && move.lines > moves[bestAt].lines)) bestAt = i;
	});
	return moves.slice(Math.max(0, bestAt - count + 1), bestAt + 1);
}
