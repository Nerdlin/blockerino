import { applyMove, CheckersBoard, CheckersState, gameResult, initialState, legalMoves, Piece } from "./Rules";
import { chooseCheckersMove } from "../bots/CheckersBot";

// "c3" style names: files a..h left to right, ranks 1..8 bottom to top (white plays up from rank 1).
const sq = (name: string) => (8 - Number(name[1])) * 8 + (name.charCodeAt(0) - 97);
const boardWith = (pieces: Record<string, Piece>): CheckersBoard => {
	const board: CheckersBoard = Array(64).fill(null);
	for (const [name, piece] of Object.entries(pieces)) board[sq(name)] = piece;
	return board;
};
const stateWith = (pieces: Record<string, Piece>, turn: "w" | "b" = "w"): CheckersState => ({ board: boardWith(pieces), turn, quietKingPlies: 0 });
const names = (path: number[]) => path.map((square) => String.fromCharCode(97 + (square % 8)) + (8 - Math.floor(square / 8))).join("-");

describe("checkers rules", () => {
	it("starts with twelve men a side and seven opening moves for white", () => {
		const state = initialState();
		expect(state.board.filter((cell) => cell === "w")).toHaveLength(12);
		expect(state.board.filter((cell) => cell === "b")).toHaveLength(12);
		expect(legalMoves(state.board, "w")).toHaveLength(7);
	});

	it("makes a capture compulsory", () => {
		const moves = legalMoves(boardWith({ c3: "w", g3: "w", d4: "b" }), "w");
		expect(moves.map((move) => names(move.path))).toEqual(["c3-e5"]);
	});

	it("lets a man capture backwards", () => {
		const moves = legalMoves(boardWith({ e5: "w", d4: "b" }), "w");
		expect(moves.map((move) => names(move.path))).toEqual(["e5-c3"]);
	});

	it("goes on capturing to the end of the chain", () => {
		const moves = legalMoves(boardWith({ a1: "w", b2: "b", d4: "b", f6: "b" }), "w");
		expect(moves.map((move) => names(move.path))).toEqual(["a1-c3-e5-g7"]);
		expect(moves[0].captures).toHaveLength(3);
	});

	it("crowns a man in the middle of a capture and lets it go on as a king", () => {
		// d6 jumps e7 and lands on f8, the far row, so it is a king when the move ends
		const state = stateWith({ d6: "w", e7: "b", c5: "b" });
		const moves = legalMoves(state.board, "w");
		const crowning = moves.find((move) => names(move.path).startsWith("d6-f8"));
		expect(crowning).toBeDefined();
		const after = applyMove(state, crowning!);
		expect(after.board[crowning!.path[crowning!.path.length - 1]]).toBe("W");
	});

	it("flies a king over distance to capture", () => {
		const moves = legalMoves(boardWith({ a1: "W", e5: "b" }), "w");
		expect(moves.map((move) => names(move.path)).sort()).toEqual(["a1-f6", "a1-g7", "a1-h8"]);
	});

	it("makes a king land where its capture can continue", () => {
		// after taking c3 the king could land on d2 or e1; only from d2 can it go on (over e3 to f4), so it must land there
		const moves = legalMoves(boardWith({ a5: "W", c3: "b", e3: "b" }), "w");
		expect(moves.every((move) => move.captures.length === 2)).toBe(true);
	});

	it("never jumps the same piece twice", () => {
		const moves = legalMoves(boardWith({ c3: "W", d4: "b" }), "w");
		for (const move of moves) expect(new Set(move.captures).size).toBe(move.captures.length);
	});

	it("ends the game when the side to move has no moves", () => {
		expect(gameResult(stateWith({ a1: "w" }, "b"))).toBe("w");
		// the black man on h6 is blocked by g5, and g5 cannot be taken because f4 is occupied
		expect(gameResult(stateWith({ h6: "b", g5: "w", f4: "w" }, "b"))).toBe("w");
	});

	it("calls a draw after fifteen king moves each without a capture", () => {
		expect(gameResult({ ...stateWith({ a1: "W", h8: "B" }), quietKingPlies: 30 })).toBe("draw");
	});
});

describe("checkers bot", () => {
	it("plays a legal move", () => {
		const state = initialState();
		const move = chooseCheckersMove(state, "hard", () => 0.5);
		expect(legalMoves(state.board, "w")).toContainEqual(move);
	});

	it("takes a free piece rather than giving one away", () => {
		// white can take on d4 with c3 (safe) or step elsewhere
		const state = stateWith({ c3: "w", h2: "w", d4: "b", a7: "b" });
		const move = chooseCheckersMove(state, "hard", () => 0.5);
		expect(move?.captures).toHaveLength(1);
	});
});
