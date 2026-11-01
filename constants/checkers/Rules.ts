// Russian draughts on an 8x8 board. Squares are 0..63, row 0 at the top; only dark squares (row + col odd) are used.
// White starts on the bottom three rows and moves up. Capturing is compulsory and a capture goes on while it can
// (any capture sequence may be chosen, not necessarily the longest). Men capture backwards too. Kings fly: they move
// and capture along a diagonal over any distance. A man that reaches the far row during a capture becomes a king and
// goes on capturing as a king. Captured pieces leave the board only when the move is over, and no piece can be jumped
// twice (the Turkish rule).

export type Side = "w" | "b";
export type Piece = "w" | "b" | "W" | "B";
export type CheckersBoard = (Piece | null)[];

export interface CheckersMove {
	/** The squares the piece stands on, from its start to where it ends; more than two for a multi-capture. */
	path: number[];
	/** The squares of the pieces taken, in the order they were jumped. */
	captures: number[];
}

export interface CheckersState {
	board: CheckersBoard;
	turn: Side;
	/** Plies in a row in which only kings moved and nothing was taken; 30 of them (15 each) is a draw. */
	quietKingPlies: number;
}

export const DRAW_QUIET_KING_PLIES = 30;
const DIRECTIONS = [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const;

export const rowOf = (square: number) => Math.floor(square / 8);
export const colOf = (square: number) => square % 8;
const at = (row: number, col: number) => (row >= 0 && row < 8 && col >= 0 && col < 8 ? row * 8 + col : -1);
export const isDarkSquare = (square: number) => (rowOf(square) + colOf(square)) % 2 === 1;
export const sideOf = (piece: Piece): Side => (piece === "w" || piece === "W" ? "w" : "b");
export const isKing = (piece: Piece) => piece === "W" || piece === "B";
const forward = (side: Side) => (side === "w" ? -1 : 1);
const promotionRow = (side: Side) => (side === "w" ? 0 : 7);

export function initialBoard(): CheckersBoard {
	const board: CheckersBoard = Array(64).fill(null);
	for (let square = 0; square < 64; square += 1) {
		if (!isDarkSquare(square)) continue;
		if (rowOf(square) <= 2) board[square] = "b";
		else if (rowOf(square) >= 5) board[square] = "w";
	}
	return board;
}

export function initialState(): CheckersState {
	return { board: initialBoard(), turn: "w", quietKingPlies: 0 };
}

function canCapture(board: CheckersBoard, from: number, piece: Piece, taken: number[]): boolean {
	const side = sideOf(piece);
	for (const [dr, dc] of DIRECTIONS) {
		let row = rowOf(from) + dr;
		let col = colOf(from) + dc;
		if (isKing(piece)) {
			while (at(row, col) >= 0 && board[at(row, col)] === null) {
				row += dr;
				col += dc;
			}
		}
		const over = at(row, col);
		if (over < 0) continue;
		const victim = board[over];
		if (!victim || sideOf(victim) === side || taken.includes(over)) continue;
		const land = at(row + dr, col + dc);
		if (land >= 0 && board[land] === null) return true;
	}
	return false;
}

function captureSequences(board: CheckersBoard, from: number, piece: Piece, taken: number[], path: number[], out: CheckersMove[]) {
	const side = sideOf(piece);
	const king = isKing(piece);
	let extended = false;
	for (const [dr, dc] of DIRECTIONS) {
		let row = rowOf(from) + dr;
		let col = colOf(from) + dc;
		// a king may slide over empty squares up to the piece it takes
		if (king) {
			while (at(row, col) >= 0 && board[at(row, col)] === null) {
				row += dr;
				col += dc;
			}
		}
		const over = at(row, col);
		if (over < 0) continue;
		const victim = board[over];
		if (!victim || sideOf(victim) === side || taken.includes(over)) continue;
		const landings: { square: number; piece: Piece }[] = [];
		let landRow = row + dr;
		let landCol = col + dc;
		while (at(landRow, landCol) >= 0 && board[at(landRow, landCol)] === null) {
			const crowned = !king && landRow === promotionRow(side);
			landings.push({ square: at(landRow, landCol), piece: crowned ? (side === "w" ? "W" : "B") : piece });
			if (!king) break;
			landRow += dr;
			landCol += dc;
		}
		// a king that can go on taking from some of its landing squares must land on one of those
		const nextTaken = [...taken, over];
		const continuing = landings.filter((landing) => canCapture(board, landing.square, landing.piece, nextTaken));
		for (const landing of continuing.length > 0 ? continuing : landings) {
			extended = true;
			captureSequences(board, landing.square, landing.piece, nextTaken, [...path, landing.square], out);
		}
	}
	if (!extended && taken.length > 0) out.push({ path, captures: taken });
}

/** Every legal move of `side`; only captures when any capture exists. */
export function legalMoves(board: CheckersBoard, side: Side): CheckersMove[] {
	const captures: CheckersMove[] = [];
	const quiet: CheckersMove[] = [];
	for (let from = 0; from < 64; from += 1) {
		const piece = board[from];
		if (!piece || sideOf(piece) !== side) continue;
		// the moving piece's own square counts as empty while it travels (a king may pass back over it)
		const lifted = [...board];
		lifted[from] = null;
		captureSequences(lifted, from, piece, [], [from], captures);
		if (captures.length > 0) continue;
		for (const [dr, dc] of DIRECTIONS) {
			if (!isKing(piece) && dr !== forward(side)) continue;
			let row = rowOf(from) + dr;
			let col = colOf(from) + dc;
			while (at(row, col) >= 0 && board[at(row, col)] === null) {
				quiet.push({ path: [from, at(row, col)], captures: [] });
				if (!isKing(piece)) break;
				row += dr;
				col += dc;
			}
		}
	}
	return captures.length > 0 ? captures : quiet;
}

export function applyMove(state: CheckersState, move: CheckersMove): CheckersState {
	const board = [...state.board];
	const from = move.path[0];
	const to = move.path[move.path.length - 1];
	let piece = board[from] as Piece;
	const wasKing = isKing(piece);
	board[from] = null;
	for (const square of move.captures) board[square] = null;
	// crowned on the far row, also when the capture only passed through it
	if (!wasKing && move.path.slice(1).some((square) => rowOf(square) === promotionRow(state.turn))) {
		piece = state.turn === "w" ? "W" : "B";
	}
	board[to] = piece;
	const quietKing = wasKing && move.captures.length === 0;
	return {
		board,
		turn: state.turn === "w" ? "b" : "w",
		quietKingPlies: quietKing ? state.quietKingPlies + 1 : 0,
	};
}

/** "w" or "b" when that side has won (the other cannot move), "draw", or null while the game goes on. */
export function gameResult(state: CheckersState): Side | "draw" | null {
	if (legalMoves(state.board, state.turn).length === 0) return state.turn === "w" ? "b" : "w";
	if (state.quietKingPlies >= DRAW_QUIET_KING_PLIES) return "draw";
	return null;
}

export function isValidState(value: unknown): value is CheckersState {
	const state = value as CheckersState | null;
	return Boolean(state)
		&& Array.isArray(state!.board) && state!.board.length === 64
		&& state!.board.every((cell) => cell === null || cell === "w" || cell === "b" || cell === "W" || cell === "B")
		&& (state!.turn === "w" || state!.turn === "b")
		&& typeof state!.quietKingPlies === "number";
}
