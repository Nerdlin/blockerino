// "Share a moment": while a game is played, the last few moves are kept here so the player can later share a short
// animated GIF of them (see constants/MomentFrames.ts for the drawing and constants/GifEncoder.ts for the file).
//
// The recorder is meant to cost nothing noticeable during play: a move is one small array of the board before it
// (64 or 100 numbers), the piece and a few counters, and only the last `capacity` moves are kept in a ring buffer.
// Nothing is drawn or encoded until someone actually presses "Share".

/** A board cell packed into one number: 0xRRGGBB for a filled cell, -1 for an empty one. */
export type PackedCell = number;

export const EMPTY_CELL: PackedCell = -1;

/** How many moves a moment keeps by default (about 4-5 seconds of GIF). */
export const MOMENT_CAPACITY = 6;

export interface MomentMove {
	/** The board just before the piece was put down, row by row (length boardLength * boardLength). */
	before: Int32Array;
	/** The piece's shape (1 = a block) and its colour as 0xRRGGBB. */
	matrix: number[][];
	color: number;
	/** Where the piece's top left corner landed. */
	x: number;
	y: number;
	/** Lines (rows + columns) the move cleared, points it earned, and the score and combo right after it. */
	lines: number;
	points: number;
	score: number;
	combo: number;
}

export interface MomentLog {
	boardLength: number;
	/** Oldest first. */
	moves: MomentMove[];
	/** The best combo among the kept moves. */
	bestCombo: number;
}

export function packColor(color: { r: number; g: number; b: number }): number {
	"worklet";
	return ((color.r & 255) << 16) | ((color.g & 255) << 8) | (color.b & 255);
}

export function unpackColor(packed: number): { r: number; g: number; b: number } {
	return { r: (packed >> 16) & 255, g: (packed >> 8) & 255, b: packed & 255 };
}

/**
 * The board as a flat list of packed cells. Only settled blocks count: a hovered shadow or an empty cell is EMPTY_CELL.
 * A worklet so the game can pack the board on the UI thread and hand a plain number array to the JS thread.
 */
export function packBoardCells(board: { blockType: number; color: { r: number; g: number; b: number } }[][], filledType: number, breakFilledType: number): number[] {
	"worklet";
	const out: number[] = [];
	for (let y = 0; y < board.length; y++) {
		const row = board[y];
		for (let x = 0; x < row.length; x++) {
			const cell = row[x];
			out.push(cell.blockType === filledType || cell.blockType === breakFilledType ? packColor(cell.color) : -1);
		}
	}
	return out;
}

/** Rows and columns that are full once the piece is on the board (what the move clears). */
export function findFullLines(cells: ArrayLike<number>, boardLength: number): { rows: number[]; cols: number[] } {
	const rows: number[] = [];
	const cols: number[] = [];
	for (let y = 0; y < boardLength; y++) {
		let full = true;
		for (let x = 0; x < boardLength; x++) if (cells[y * boardLength + x] === EMPTY_CELL) { full = false; break; }
		if (full) rows.push(y);
	}
	for (let x = 0; x < boardLength; x++) {
		let full = true;
		for (let y = 0; y < boardLength; y++) if (cells[y * boardLength + x] === EMPTY_CELL) { full = false; break; }
		if (full) cols.push(x);
	}
	return { rows, cols };
}

/** The board with the move's piece put down (before any line is cleared). */
export function placeMove(move: MomentMove, boardLength: number): Int32Array {
	const cells = Int32Array.from(move.before);
	for (let py = 0; py < move.matrix.length; py++) {
		for (let px = 0; px < move.matrix[py].length; px++) {
			if (move.matrix[py][px] < 1) continue;
			const x = move.x + px;
			const y = move.y + py;
			if (x < 0 || y < 0 || x >= boardLength || y >= boardLength) continue;
			cells[y * boardLength + x] = move.color;
		}
	}
	return cells;
}

/** The board after the move: the piece put down and its full lines cleared. */
export function settleMove(move: MomentMove, boardLength: number): Int32Array {
	const cells = placeMove(move, boardLength);
	const { rows, cols } = findFullLines(cells, boardLength);
	for (const y of rows) for (let x = 0; x < boardLength; x++) cells[y * boardLength + x] = EMPTY_CELL;
	for (const x of cols) for (let y = 0; y < boardLength; y++) cells[y * boardLength + x] = EMPTY_CELL;
	return cells;
}

/** Keeps the last `capacity` moves of one game. */
export class MomentRecorder {
	readonly capacity: number;
	private boardLength: number;
	private slots: (MomentMove | undefined)[];
	private next = 0;
	private count = 0;

	constructor(boardLength: number, capacity: number = MOMENT_CAPACITY) {
		this.boardLength = boardLength;
		this.capacity = Math.max(1, Math.floor(capacity));
		this.slots = new Array(this.capacity);
	}

	get size(): number {
		return this.count;
	}

	push(move: MomentMove): void {
		if (move.before.length !== this.boardLength * this.boardLength) return;
		this.slots[this.next] = move;
		this.next = (this.next + 1) % this.capacity;
		this.count = Math.min(this.capacity, this.count + 1);
	}

	/** Records a move from the plain values the game hands over (see packBoardCells). */
	record(before: ArrayLike<number>, matrix: number[][], color: number, x: number, y: number, lines: number, points: number, score: number, combo: number): void {
		this.push({
			before: Int32Array.from(before as ArrayLike<number>),
			matrix: matrix.map((row) => row.slice()),
			color,
			x,
			y,
			lines,
			points: Math.floor(points),
			score: Math.floor(score),
			combo,
		});
	}

	/** A second chance or a new game: the old moves no longer lead to the board on screen. */
	clear(): void {
		this.slots = new Array(this.capacity);
		this.next = 0;
		this.count = 0;
	}

	/** The kept moves, oldest first. */
	moves(): MomentMove[] {
		const out: MomentMove[] = [];
		const start = (this.next - this.count + this.capacity) % this.capacity;
		for (let i = 0; i < this.count; i++) {
			const move = this.slots[(start + i) % this.capacity];
			if (move) out.push(move);
		}
		return out;
	}

	snapshot(): MomentLog {
		const moves = this.moves();
		return {
			boardLength: this.boardLength,
			moves,
			bestCombo: moves.reduce((best, move) => Math.max(best, move.combo), 0),
		};
	}
}

/** A combo worth offering to share right away. */
export const BIG_COMBO = 4;

export function isBigComboMove(lines: number, combo: number): boolean {
	return lines >= 3 || (lines > 0 && combo >= BIG_COMBO);
}
