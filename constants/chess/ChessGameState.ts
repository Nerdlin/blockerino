import { Chess } from "chess.js";
import { AUTO_ABORT_MS, ClockState, Color, createClock, flaggedSide, pressClock } from "./ChessClock";
import { TimeControl } from "./TimeControls";

// One chess game as plain data. The screen keeps a ChessGameState and calls these functions for every event (a move,
// a resignation, a draw offer, the clock running out); online, the same events travel to the other player and are
// applied there. Nothing here touches the network, a timer or React.

export type EndReason =
	| "checkmate"
	| "stalemate"
	| "timeout"
	| "resignation"
	| "agreement"
	| "repetition"
	| "insufficient"
	| "fiftyMove"
	| "abort"
	| "abandoned";

export interface GameResult {
	/** null for an aborted game: nobody won, and it is not rated. */
	winner: Color | "draw" | null;
	reason: EndReason;
}

export interface PlayedMove {
	from: string;
	to: string;
	san: string;
	promotion?: string;
}

export interface ChessGameState {
	fen: string;
	/** Moves in SAN, in order. */
	history: string[];
	/** The same moves with squares, for highlighting and replay. */
	moves: PlayedMove[];
	/** Null in games without a clock (against bots). */
	clock: ClockState | null;
	startedAt: number;
	drawOfferFrom: Color | null;
	result: GameResult | null;
}

export type MoveOutcome =
	| { ok: true; state: ChessGameState }
	| { ok: false; reason: "illegal" | "finished" | "needsPromotion" | "notYourTurn" };

export function newGame(control: TimeControl | null, now: number): ChessGameState {
	return {
		fen: new Chess().fen(),
		history: [],
		moves: [],
		clock: control ? createClock(control, now) : null,
		startedAt: now,
		drawOfferFrom: null,
		result: null,
	};
}

export function turnOf(state: ChessGameState): Color {
	return state.fen.split(" ")[1] === "b" ? "b" : "w";
}

/** Rebuilds the board; plain FEN replays are enough because repetition needs the history, so replay the moves. */
export function boardOf(state: ChessGameState): Chess {
	const chess = new Chess();
	try {
		for (const move of state.history) chess.move(move);
		if (chess.fen() === state.fen) return chess;
	} catch {}
	return new Chess(state.fen);
}

/** The position after `ply` half-moves (0 is the start), for stepping back through a game. */
export function fenAfter(state: Pick<ChessGameState, "history">, ply: number): string {
	const chess = new Chess();
	const upTo = Math.max(0, Math.min(ply, state.history.length));
	for (let i = 0; i < upTo; i++) chess.move(state.history[i]);
	return chess.fen();
}

/** True when moving `from` to `to` is a pawn reaching the last rank, so the player must pick a piece. */
export function isPromotionMove(state: ChessGameState, from: string, to: string): boolean {
	const legal = boardOf(state).moves({ square: from as never, verbose: true }) as unknown as { to: string; promotion?: string }[];
	return legal.some((move) => move.to === to && Boolean(move.promotion));
}

/** Whether `color` still has anything that could checkmate (a lone king or king and one minor piece cannot). */
export function hasMatingMaterial(chess: Chess, color: Color): boolean {
	let minors = 0;
	for (const row of chess.board()) {
		for (const piece of row) {
			if (!piece || piece.color !== color) continue;
			if (piece.type === "p" || piece.type === "r" || piece.type === "q") return true;
			if (piece.type === "n" || piece.type === "b") minors++;
		}
	}
	return minors >= 2;
}

function finish(state: ChessGameState, result: GameResult): ChessGameState {
	return { ...state, result, drawOfferFrom: null };
}

function resultOfBoard(chess: Chess): GameResult | null {
	if (chess.isCheckmate()) return { winner: chess.turn() === "w" ? "b" : "w", reason: "checkmate" };
	if (chess.isStalemate()) return { winner: "draw", reason: "stalemate" };
	if (chess.isInsufficientMaterial()) return { winner: "draw", reason: "insufficient" };
	if (chess.isThreefoldRepetition()) return { winner: "draw", reason: "repetition" };
	if (chess.isDrawByFiftyMoves()) return { winner: "draw", reason: "fiftyMove" };
	return null;
}

/**
 * Plays a move for the side to move. `now` settles the clock. A pawn reaching the last rank needs `promotion`
 * ("q", "r", "b" or "n"); without it the answer is needsPromotion so the screen can ask.
 */
export function playMove(state: ChessGameState, move: { from: string; to: string; promotion?: string }, now: number): MoveOutcome {
	if (state.result) return { ok: false, reason: "finished" };
	if (state.clock && flaggedSide(state.clock, now)) return { ok: false, reason: "finished" };
	if (isPromotionMove(state, move.from, move.to) && !move.promotion) return { ok: false, reason: "needsPromotion" };

	const chess = boardOf(state);
	const mover = chess.turn();
	let played;
	try {
		played = chess.move({ from: move.from, to: move.to, promotion: move.promotion });
	} catch {
		return { ok: false, reason: "illegal" };
	}
	const next: ChessGameState = {
		...state,
		fen: chess.fen(),
		history: [...state.history, played.san],
		moves: [...state.moves, { from: played.from, to: played.to, san: played.san, promotion: played.promotion }],
		clock: state.clock ? pressClock(state.clock, mover, now) : null,
		// a move answers any draw offer: the offer is gone
		drawOfferFrom: null,
	};
	const result = resultOfBoard(chess);
	return { ok: true, state: result ? finish(next, result) : next };
}

export function resign(state: ChessGameState, side: Color): ChessGameState {
	if (state.result) return state;
	return finish(state, { winner: side === "w" ? "b" : "w", reason: "resignation" });
}

/** An offer from `side`; ignored when the game is over or the offer is already out. */
export function offerDraw(state: ChessGameState, side: Color): ChessGameState {
	if (state.result || state.drawOfferFrom) return state;
	return { ...state, drawOfferFrom: side };
}

/** The other side answers: accept ends the game as a draw, decline clears the offer. */
export function answerDraw(state: ChessGameState, accept: boolean): ChessGameState {
	if (state.result || !state.drawOfferFrom) return state;
	return accept ? finish(state, { winner: "draw", reason: "agreement" }) : { ...state, drawOfferFrom: null };
}

/**
 * Settles a fallen flag. If the other side could never checkmate with what is left, the game is a draw, as in the
 * rules of chess. Returns the state unchanged while nobody is out of time.
 */
export function settleTimeout(state: ChessGameState, now: number): ChessGameState {
	if (state.result || !state.clock) return state;
	const fallen = flaggedSide(state.clock, now);
	if (!fallen) return state;
	const winner: Color = fallen === "w" ? "b" : "w";
	if (!hasMatingMaterial(boardOf(state), winner)) return finish(state, { winner: "draw", reason: "insufficient" });
	return finish(state, { winner, reason: "timeout" });
}

/** An unplayed game is aborted for nobody's loss; only possible before the third half-move. */
export function canAbort(state: ChessGameState): boolean {
	return !state.result && state.history.length < 2;
}

export function abort(state: ChessGameState): ChessGameState {
	return canAbort(state) ? finish(state, { winner: null, reason: "abort" }) : state;
}

/** White never moved within the allowed time: the game is aborted. */
export function settleAutoAbort(state: ChessGameState, now: number): ChessGameState {
	if (state.result || !state.clock || state.history.length > 0) return state;
	return now - state.startedAt >= AUTO_ABORT_MS ? abort(state) : state;
}

/** The player left or lost the connection for good: the other side wins, unless the game never really began. */
export function abandon(state: ChessGameState, leaver: Color): ChessGameState {
	if (state.result) return state;
	if (state.history.length < 2) return finish(state, { winner: null, reason: "abort" });
	return finish(state, { winner: leaver === "w" ? "b" : "w", reason: "abandoned" });
}

/** Score from White's point of view (1, 0.5, 0) for rating; null when the game is unrated (aborted, unfinished). */
export function whiteScore(result: GameResult | null): number | null {
	if (!result || result.winner === null) return null;
	if (result.winner === "draw") return 0.5;
	return result.winner === "w" ? 1 : 0;
}
