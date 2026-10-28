import { TimeControl } from "./TimeControls";

// A chess clock as plain data: nothing here owns a timer, callers pass "now". That keeps it testable and lets
// both players compute the same remaining time from the same move timestamps.
//
// Rules: nobody's clock runs until White has moved (White has AUTO_ABORT_MS to make the first move); after that
// only the side to move is running. The increment is added after a move, but not for the first move of each side.

export type Color = "w" | "b";

export const AUTO_ABORT_MS = 35000;

export interface ClockState {
	whiteMs: number;
	blackMs: number;
	incrementMs: number;
	turn: Color;
	running: boolean;
	/** When the running side's time was last settled. */
	lastTickAt: number;
	/** Half-moves played so far. */
	plies: number;
}

export function createClock(control: TimeControl, now: number): ClockState {
	const base = control.baseSeconds * 1000;
	return { whiteMs: base, blackMs: base, incrementMs: control.incrementSeconds * 1000, turn: "w", running: false, lastTickAt: now, plies: 0 };
}

/** Time left for both sides at `now`, counting down the side whose clock is running. Never negative. */
export function remainingMs(clock: ClockState, now: number): { whiteMs: number; blackMs: number } {
	if (!clock.running) return { whiteMs: clock.whiteMs, blackMs: clock.blackMs };
	const spent = Math.max(0, now - clock.lastTickAt);
	return clock.turn === "w"
		? { whiteMs: Math.max(0, clock.whiteMs - spent), blackMs: clock.blackMs }
		: { whiteMs: clock.whiteMs, blackMs: Math.max(0, clock.blackMs - spent) };
}

/** The side whose flag fell, or null. */
export function flaggedSide(clock: ClockState, now: number): Color | null {
	if (!clock.running) return null;
	const left = remainingMs(clock, now);
	if (clock.turn === "w" && left.whiteMs <= 0) return "w";
	if (clock.turn === "b" && left.blackMs <= 0) return "b";
	return null;
}

/** `mover` has just played a move at `now`: settle their time, add the increment (not on their first move), hand over. */
export function pressClock(clock: ClockState, mover: Color, now: number): ClockState {
	if (mover !== clock.turn) return clock;
	const left = remainingMs(clock, now);
	const firstMoveOfSide = mover === "w" ? clock.plies === 0 : clock.plies === 1;
	const bonus = firstMoveOfSide ? 0 : clock.incrementMs;
	return {
		...clock,
		whiteMs: mover === "w" ? left.whiteMs + bonus : left.whiteMs,
		blackMs: mover === "b" ? left.blackMs + bonus : left.blackMs,
		turn: mover === "w" ? "b" : "w",
		// the clocks start with White's first move
		running: true,
		lastTickAt: now,
		plies: clock.plies + 1,
	};
}

/** How long White still has to make the first move before the game is aborted; null once the game is under way. */
export function autoAbortLeftMs(clock: ClockState, startedAt: number, now: number): number | null {
	if (clock.plies > 0) return null;
	return Math.max(0, AUTO_ABORT_MS - (now - startedAt));
}
