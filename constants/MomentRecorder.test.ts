import {
	BIG_COMBO,
	EMPTY_CELL,
	MOMENT_CAPACITY,
	MomentRecorder,
	findFullLines,
	isBigComboMove,
	packBoardCells,
	packColor,
	placeMove,
	settleMove,
	unpackColor,
	type MomentMove,
} from "./MomentRecorder";

const N = 4;

function boardOf(...filled: [number, number, number][]): Int32Array {
	const cells = new Int32Array(N * N).fill(EMPTY_CELL);
	for (const [x, y, color] of filled) cells[y * N + x] = color;
	return cells;
}

function move(score: number, extra: Partial<MomentMove> = {}): MomentMove {
	return { before: boardOf(), matrix: [[1]], color: 0xff0000, x: 0, y: 0, lines: 0, points: 1, score, combo: 0, ...extra };
}

describe("MomentRecorder ring buffer", () => {
	it("keeps only the last `capacity` moves, oldest first", () => {
		const recorder = new MomentRecorder(N, 3);
		for (let i = 1; i <= 7; i++) recorder.push(move(i));
		expect(recorder.size).toBe(3);
		expect(recorder.moves().map((m) => m.score)).toEqual([5, 6, 7]);
	});

	it("returns everything while it is not full", () => {
		const recorder = new MomentRecorder(N, 6);
		recorder.push(move(10));
		recorder.push(move(20));
		expect(recorder.moves().map((m) => m.score)).toEqual([10, 20]);
		expect(new MomentRecorder(N).capacity).toBe(MOMENT_CAPACITY);
	});

	it("starts again after clear (a second chance or a new game)", () => {
		const recorder = new MomentRecorder(N, 3);
		for (let i = 1; i <= 5; i++) recorder.push(move(i));
		recorder.clear();
		expect(recorder.size).toBe(0);
		expect(recorder.moves()).toEqual([]);
		recorder.push(move(99));
		expect(recorder.moves().map((m) => m.score)).toEqual([99]);
	});

	it("ignores a board of the wrong size and a capacity below one", () => {
		const recorder = new MomentRecorder(N, 0);
		expect(recorder.capacity).toBe(1);
		recorder.push({ ...move(1), before: new Int32Array(9) });
		expect(recorder.size).toBe(0);
	});

	it("copies what the game hands over, so later changes do not rewrite history", () => {
		const recorder = new MomentRecorder(N, 3);
		const before = Array.from(boardOf([1, 1, 0x00ff00]));
		const matrix = [[1, 1]];
		recorder.record(before, matrix, 0x123456, 2, 1, 1, 12.7, 105.9, 3);
		before[5] = EMPTY_CELL;
		matrix[0][0] = 0;
		const [kept] = recorder.moves();
		expect(kept.before[5]).toBe(0x00ff00);
		expect(kept.matrix).toEqual([[1, 1]]);
		expect(kept.points).toBe(12);
		expect(kept.score).toBe(105);
	});

	it("snapshot has the board size and the best combo of the kept moves", () => {
		const recorder = new MomentRecorder(N, 2);
		recorder.push(move(1, { combo: 9 }));
		recorder.push(move(2, { combo: 2 }));
		recorder.push(move(3, { combo: 4 }));
		const snapshot = recorder.snapshot();
		expect(snapshot.boardLength).toBe(N);
		expect(snapshot.moves.map((m) => m.score)).toEqual([2, 3]);
		expect(snapshot.bestCombo).toBe(4);
	});
});

describe("board helpers", () => {
	it("packs and unpacks colours", () => {
		expect(packColor({ r: 227, g: 143, b: 16 })).toBe(0xe38f10);
		expect(unpackColor(0xe38f10)).toEqual({ r: 227, g: 143, b: 16 });
	});

	it("packs only settled blocks of a game board", () => {
		const EMPTY = 0;
		const HOVERED = 1;
		const FILLED = 4;
		const cell = (blockType: number, r = 1, g = 2, b = 3) => ({ blockType, color: { r, g, b } });
		const board = [
			[cell(FILLED, 255, 0, 0), cell(EMPTY), cell(HOVERED)],
			[cell(2, 0, 255, 0), cell(3), cell(FILLED, 0, 0, 255)],
		];
		expect(packBoardCells(board, FILLED, 2)).toEqual([0xff0000, -1, -1, 0x00ff00, -1, 0x0000ff]);
	});

	it("finds the full rows and columns", () => {
		const cells = boardOf([0, 1, 1], [1, 1, 1], [2, 1, 1], [3, 1, 1], [2, 0, 1], [2, 2, 1], [2, 3, 1]);
		expect(findFullLines(cells, N)).toEqual({ rows: [1], cols: [2] });
	});

	it("places the piece and clears the full lines it completes", () => {
		const before = boardOf([0, 0, 1], [1, 0, 1], [2, 0, 1]);
		const m = move(5, { before, matrix: [[1]], x: 3, y: 0, color: 0xabcdef, lines: 1 });
		const placed = placeMove(m, N);
		expect(placed[3]).toBe(0xabcdef);
		expect(before[3]).toBe(EMPTY_CELL);
		const settled = settleMove(m, N);
		for (let x = 0; x < N; x++) expect(settled[x]).toBe(EMPTY_CELL);
	});

	it("ignores piece cells that fall off the board", () => {
		const m = move(1, { matrix: [[1, 1]], x: 3, y: 0 });
		expect(placeMove(m, N)[3]).toBe(m.color);
	});

	it("tells a big combo from a small one", () => {
		expect(isBigComboMove(0, 9)).toBe(false);
		expect(isBigComboMove(1, 1)).toBe(false);
		expect(isBigComboMove(3, 1)).toBe(true);
		expect(isBigComboMove(1, BIG_COMBO)).toBe(true);
	});
});
