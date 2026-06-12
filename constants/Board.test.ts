import {
	Board,
	BoardBlockType,
	calculateGameSizes,
	clearHoverBlocks,
	cloneBoard,
	hasAnyPossibleMove,
	newEmptyBoard,
	updateHoveredBreaks,
} from "./Board";
import { PieceData } from "./Piece";

function fillBoard(board: Board) {
	for (const row of board) {
		for (const cell of row) {
			cell.blockType = BoardBlockType.FILLED;
		}
	}
}

describe("board helpers", () => {
	it("deep-clones cells before mutating hover or placement state", () => {
		const board = newEmptyBoard(4);
		const cloned = cloneBoard(board);

		cloned[0][0].blockType = BoardBlockType.FILLED;
		cloned[0][0].color.r = 123;

		expect(board[0][0].blockType).toBe(BoardBlockType.EMPTY);
		expect(board[0][0].color.r).not.toBe(123);
	});

	it("does not leak hover placement into the real board when no line clears", () => {
		const board = newEmptyBoard(4);
		const oneBlock: PieceData = {
			matrix: [[1]],
			color: { r: 255, g: 255, b: 255 },
			distributionPoints: 1,
		};

		updateHoveredBreaks(board, oneBlock, 0, 0);

		expect(board[0][0].blockType).toBe(BoardBlockType.EMPTY);
	});

	it("keeps filled preview cells filled when a hover clears crossing lines", () => {
		const board = newEmptyBoard(4);
		board[0][0].blockType = BoardBlockType.FILLED;
		board[0][1].blockType = BoardBlockType.FILLED;
		board[0][2].blockType = BoardBlockType.FILLED;
		board[1][0].blockType = BoardBlockType.FILLED;
		board[2][0].blockType = BoardBlockType.FILLED;

		const cornerPiece: PieceData = {
			matrix: [
				[0, 0, 0, 1],
				[0, 0, 0, 0],
				[0, 0, 0, 0],
				[1, 0, 0, 0],
			],
			color: { r: 255, g: 255, b: 255 },
			distributionPoints: 1,
		};

		updateHoveredBreaks(board, cornerPiece, 0, 0);

		expect(board[0][0].blockType).toBe(BoardBlockType.HOVERED_BREAK_FILLED);
		clearHoverBlocks(board);
		expect(board[0][0].blockType).toBe(BoardBlockType.FILLED);
	});

	it("checks possible moves from the supplied board and hand immediately", () => {
		const board = newEmptyBoard(3);
		fillBoard(board);
		board[2][2].blockType = BoardBlockType.EMPTY;

		const oneBlock: PieceData = {
			matrix: [[1]],
			color: { r: 255, g: 255, b: 255 },
			distributionPoints: 1,
		};
		const twoBlock: PieceData = {
			matrix: [[1, 1]],
			color: { r: 255, g: 255, b: 255 },
			distributionPoints: 1,
		};

		expect(hasAnyPossibleMove(board, [twoBlock])).toBe(false);
		expect(hasAnyPossibleMove(board, [twoBlock, oneBlock])).toBe(true);
	});

	it("keeps multiplayer boards inside short mobile layouts", () => {
		const sizes = calculateGameSizes({
			width: 360,
			height: 700,
			boardLength: 10,
			isMultiplayer: true,
		});

		expect(sizes.GRID_BLOCK_SIZE).toBeLessThanOrEqual(20);
		expect(sizes.GRID_BLOCK_SIZE).toBeGreaterThanOrEqual(16);
		expect(sizes.GRID_BLOCK_SIZE * 10).toBeLessThanOrEqual(200);
	});
});
