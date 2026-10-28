import { Chess } from "chess.js";
import { remainingMs } from "./ChessClock";
import {
	abandon,
	abort,
	answerDraw,
	boardOf,
	canAbort,
	ChessGameState,
	hasMatingMaterial,
	isPromotionMove,
	newGame,
	offerDraw,
	playMove,
	resign,
	settleAutoAbort,
	settleTimeout,
	turnOf,
	whiteScore,
} from "./ChessGameState";
import { makeTimeControl } from "./TimeControls";

const control = makeTimeControl(180, 2);

function play(state: ChessGameState, sans: string[], startAt = 0, step = 1000): ChessGameState {
	let now = startAt;
	let current = state;
	for (const san of sans) {
		const chess = boardOf(current);
		const move = chess.move(san);
		const outcome = playMove(current, { from: move.from, to: move.to, promotion: move.promotion }, (now += step));
		if (!outcome.ok) throw new Error(`move ${san} refused: ${outcome.reason}`);
		current = outcome.state;
	}
	return current;
}

describe("moves", () => {
	it("plays legal moves, keeps SAN and squares, and hands over the turn", () => {
		const state = play(newGame(control, 0), ["e4", "e5", "Nf3"]);
		expect(state.history).toEqual(["e4", "e5", "Nf3"]);
		expect(state.moves[2]).toMatchObject({ from: "g1", to: "f3" });
		expect(turnOf(state)).toBe("b");
		expect(state.clock?.plies).toBe(3);
	});

	it("refuses an illegal move and a move after the game ended", () => {
		const state = newGame(null, 0);
		expect(playMove(state, { from: "e2", to: "e5" }, 1)).toEqual({ ok: false, reason: "illegal" });
		const over = resign(state, "w");
		expect(playMove(over, { from: "e2", to: "e4" }, 2)).toEqual({ ok: false, reason: "finished" });
	});

	it("asks for a piece when a pawn reaches the last rank, then promotes", () => {
		const base = { ...newGame(null, 0), fen: "8/P6k/8/8/8/8/7K/8 w - - 0 1" };
		expect(isPromotionMove(base, "a7", "a8")).toBe(true);
		expect(isPromotionMove(base, "h2", "h3")).toBe(false);
		expect(playMove(base, { from: "a7", to: "a8" }, 1)).toEqual({ ok: false, reason: "needsPromotion" });
		const knight = playMove(base, { from: "a7", to: "a8", promotion: "n" }, 1);
		expect(knight.ok && knight.state.history[0]).toBe("a8=N");
	});

	it("ends the game on checkmate with the right winner", () => {
		const state = play(newGame(control, 0), ["f3", "e5", "g4", "Qh4#"]);
		expect(state.result).toEqual({ winner: "b", reason: "checkmate" });
	});

	it("ends the game on stalemate and on threefold repetition", () => {
		const stalemate = { ...newGame(null, 0), fen: "7k/8/6K1/8/8/8/8/5Q2 w - - 0 1" };
		const done = playMove(stalemate, { from: "f1", to: "f7" }, 1);
		expect(done.ok && done.state.result).toEqual({ winner: "draw", reason: "stalemate" });

		const shuffle = play(newGame(null, 0), ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"]);
		expect(shuffle.result).toEqual({ winner: "draw", reason: "repetition" });
	});
});

describe("clock in a game", () => {
	it("starts after White's first move", () => {
		const state = newGame(control, 0);
		expect(state.clock?.running).toBe(false);
		const moved = play(state, ["e4"], 5000, 0);
		expect(moved.clock?.running).toBe(true);
		expect(remainingMs(moved.clock!, 8000).blackMs).toBe(177000);
	});

	it("gives the win to the other side when a flag falls, or a draw when they cannot mate", () => {
		let state = play(newGame(makeTimeControl(60, 0), 0), ["e4"], 0, 0);
		expect(settleTimeout(state, 30000)).toBe(state);
		const lost = settleTimeout(state, 61000);
		expect(lost.result).toEqual({ winner: "w", reason: "timeout" });

		const bare = { ...state, fen: "4k3/8/8/8/8/8/8/4K2N b - - 0 1", history: [] as string[] };
		const drawn = settleTimeout({ ...bare, clock: { ...state.clock!, turn: "b" } }, 61000);
		expect(drawn.result).toEqual({ winner: "draw", reason: "insufficient" });
	});

	it("aborts the game when White never moves", () => {
		const state = newGame(control, 1000);
		expect(settleAutoAbort(state, 20000)).toBe(state);
		expect(settleAutoAbort(state, 1000 + 36000).result).toEqual({ winner: null, reason: "abort" });
	});

	it("does not finish an untimed game", () => {
		const state = newGame(null, 0);
		expect(settleTimeout(state, 9e9)).toBe(state);
		expect(settleAutoAbort(state, 9e9)).toBe(state);
	});
});

describe("resign, draw, abort", () => {
	it("resign gives the win to the other side", () => {
		expect(resign(newGame(null, 0), "b").result).toEqual({ winner: "w", reason: "resignation" });
	});

	it("a draw offer needs an answer: accept ends it, decline clears it, a move clears it too", () => {
		const offered = offerDraw(play(newGame(null, 0), ["e4", "e5"]), "w");
		expect(offered.drawOfferFrom).toBe("w");
		expect(offerDraw(offered, "b")).toBe(offered);
		expect(answerDraw(offered, true).result).toEqual({ winner: "draw", reason: "agreement" });
		expect(answerDraw(offered, false).drawOfferFrom).toBeNull();
		const moved = playMove(offered, { from: "g1", to: "f3" }, 5);
		expect(moved.ok && moved.state.drawOfferFrom).toBeNull();
		expect(answerDraw(newGame(null, 0), true).result).toBeNull();
	});

	it("abort is only possible before the third half-move", () => {
		const fresh = newGame(control, 0);
		expect(canAbort(fresh)).toBe(true);
		expect(abort(fresh).result).toEqual({ winner: null, reason: "abort" });
		const three = play(fresh, ["e4", "e5", "Nf3"]);
		expect(canAbort(three)).toBe(false);
		expect(abort(three)).toBe(three);
	});

	it("leaving a started game loses it, leaving a fresh game aborts it", () => {
		expect(abandon(newGame(control, 0), "w").result).toEqual({ winner: null, reason: "abort" });
		expect(abandon(play(newGame(control, 0), ["e4", "e5", "Nf3"]), "b").result).toEqual({ winner: "w", reason: "abandoned" });
	});

	it("scores games for rating and leaves aborts unrated", () => {
		expect(whiteScore({ winner: "w", reason: "checkmate" })).toBe(1);
		expect(whiteScore({ winner: "b", reason: "resignation" })).toBe(0);
		expect(whiteScore({ winner: "draw", reason: "agreement" })).toBe(0.5);
		expect(whiteScore({ winner: null, reason: "abort" })).toBeNull();
		expect(whiteScore(null)).toBeNull();
	});
});

describe("mating material", () => {
	it("recognises what can and cannot mate", () => {
		expect(hasMatingMaterial(new Chess("4k3/8/8/8/8/8/8/4K2N w - - 0 1"), "w")).toBe(false);
		expect(hasMatingMaterial(new Chess("4k3/8/8/8/8/8/8/4KB2 w - - 0 1"), "w")).toBe(false);
		expect(hasMatingMaterial(new Chess("4k3/8/8/8/8/8/8/3NKB2 w - - 0 1"), "w")).toBe(true);
		expect(hasMatingMaterial(new Chess("4k3/8/8/8/8/8/P7/4K3 w - - 0 1"), "w")).toBe(true);
		expect(hasMatingMaterial(new Chess("4k3/8/8/8/8/8/8/4K2R w - - 0 1"), "w")).toBe(true);
	});
});
