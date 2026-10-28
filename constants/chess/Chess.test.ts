import { Chess } from "chess.js";
import { AUTO_ABORT_MS, autoAbortLeftMs, createClock, flaggedSide, pressClock, remainingMs } from "./ChessClock";
import { expectedScore, isProvisional, kFactor, MIN_RATING, newRating, ratingChange } from "./ChessElo";
import { buildPgn, resultFromWinner } from "./ChessPgn";
import { classifyTimeControl, formatClock, formatTimeControl, makeTimeControl, parseTimeControl, TIME_CONTROLS, timeControlsOf } from "./TimeControls";

describe("time controls", () => {
	it("classifies like chess.com", () => {
		expect(classifyTimeControl(60, 0)).toBe("bullet");
		expect(classifyTimeControl(60, 1)).toBe("bullet");
		expect(classifyTimeControl(120, 1)).toBe("bullet");
		expect(classifyTimeControl(180, 0)).toBe("blitz");
		expect(classifyTimeControl(180, 2)).toBe("blitz");
		expect(classifyTimeControl(300, 0)).toBe("blitz");
		expect(classifyTimeControl(600, 0)).toBe("rapid");
		expect(classifyTimeControl(900, 10)).toBe("rapid");
		expect(classifyTimeControl(1800, 0)).toBe("rapid");
	});

	it("offers three presets per class", () => {
		for (const timeClass of ["bullet", "blitz", "rapid"] as const) expect(timeControlsOf(timeClass)).toHaveLength(3);
		expect(TIME_CONTROLS).toHaveLength(9);
	});

	it("parses ids and refuses nonsense", () => {
		expect(parseTimeControl("180+2")).toEqual(makeTimeControl(180, 2));
		expect(parseTimeControl("0+0")).toBeNull();
		expect(parseTimeControl("29+0")).toBeNull();
		expect(parseTimeControl("999999+0")).toBeNull();
		expect(parseTimeControl("180+999")).toBeNull();
		expect(parseTimeControl("abc")).toBeNull();
		expect(parseTimeControl(null)).toBeNull();
	});

	it("formats controls and clocks", () => {
		expect(formatTimeControl(makeTimeControl(60, 0))).toBe("1 min");
		expect(formatTimeControl(makeTimeControl(180, 2))).toBe("3+2");
		expect(formatTimeControl(makeTimeControl(900, 10))).toBe("15+10");
		expect(formatClock(125000)).toBe("2:05");
		expect(formatClock(7400)).toBe("0:07.4");
		expect(formatClock(-5)).toBe("0:00.0");
		expect(formatClock(3725000)).toBe("1:02:05");
	});
});

describe("chess clock", () => {
	const control = makeTimeControl(180, 2);

	it("does not run before White's first move", () => {
		const clock = createClock(control, 1000);
		expect(remainingMs(clock, 50000)).toEqual({ whiteMs: 180000, blackMs: 180000 });
		expect(flaggedSide(clock, 999999)).toBeNull();
		expect(autoAbortLeftMs(clock, 1000, 1000 + 10000)).toBe(AUTO_ABORT_MS - 10000);
		expect(autoAbortLeftMs(clock, 1000, 1000 + 99999)).toBe(0);
	});

	it("starts Black's clock after the first move, with no increment for it", () => {
		let clock = createClock(control, 0);
		clock = pressClock(clock, "w", 4000);
		expect(clock.running).toBe(true);
		expect(clock.turn).toBe("b");
		expect(remainingMs(clock, 4000).whiteMs).toBe(180000 - 0);
		expect(autoAbortLeftMs(clock, 0, 5000)).toBeNull();
		expect(remainingMs(clock, 7000)).toEqual({ whiteMs: 180000, blackMs: 177000 });
	});

	it("adds the increment from each side's second move", () => {
		let clock = createClock(control, 0);
		clock = pressClock(clock, "w", 1000); // white's first move: no bonus
		clock = pressClock(clock, "b", 3000); // black's first move: spent 2 s, no bonus
		expect(remainingMs(clock, 3000)).toEqual({ whiteMs: 180000, blackMs: 178000 });
		clock = pressClock(clock, "w", 8000); // white spent 5 s, +2 bonus
		expect(remainingMs(clock, 8000)).toEqual({ whiteMs: 177000, blackMs: 178000 });
		clock = pressClock(clock, "b", 9000); // black spent 1 s, +2 bonus
		expect(remainingMs(clock, 9000)).toEqual({ whiteMs: 177000, blackMs: 179000 });
	});

	it("ignores a press from the side that is not on move", () => {
		const clock = createClock(control, 0);
		expect(pressClock(clock, "b", 100)).toBe(clock);
	});

	it("reports the flag fall and never goes negative", () => {
		let clock = createClock(makeTimeControl(60, 0), 0);
		clock = pressClock(clock, "w", 0);
		expect(flaggedSide(clock, 59000)).toBeNull();
		expect(flaggedSide(clock, 61000)).toBe("b");
		expect(remainingMs(clock, 99999).blackMs).toBe(0);
	});
});

describe("elo", () => {
	it("is symmetric at equal ratings and gives K/2 for a win", () => {
		expect(expectedScore(1200, 1200)).toBeCloseTo(0.5, 5);
		expect(ratingChange(1200, 1200, 1, 20)).toBe(10);
		expect(ratingChange(1200, 1200, 0, 20)).toBe(-10);
		expect(ratingChange(1200, 1200, 0.5, 20)).toBe(0);
	});

	it("moves new players faster and rewards upsets", () => {
		expect(kFactor(0, 1000)).toBe(40);
		expect(kFactor(30, 1500)).toBe(20);
		expect(kFactor(30, 2400)).toBe(10);
		expect(ratingChange(1000, 1400, 1, 30)).toBeGreaterThan(ratingChange(1000, 1000, 1, 30));
		expect(ratingChange(1400, 1000, 1, 30)).toBeLessThan(ratingChange(1000, 1000, 1, 30));
	});

	it("never drops under the floor and marks provisional ratings", () => {
		expect(newRating(105, 105, 0, 2)).toBe(MIN_RATING);
		expect(isProvisional(4)).toBe(true);
		expect(isProvisional(5)).toBe(false);
	});
});

describe("pgn", () => {
	it("writes headers and the moves of a short game", () => {
		const pgn = buildPgn({
			history: ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7#"],
			white: "Nerdlin",
			black: "Pip",
			result: "1-0",
			timeControl: "180+2",
			whiteElo: 1180,
			blackElo: 400,
			date: new Date(Date.UTC(2026, 9, 28)),
			termination: "checkmate",
		});
		expect(pgn).toContain('[White "Nerdlin"]');
		expect(pgn).toContain('[Black "Pip"]');
		expect(pgn).toContain('[Result "1-0"]');
		expect(pgn).toContain('[Date "2026.10.28"]');
		expect(pgn).toContain('[TimeControl "180+2"]');
		expect(pgn).toContain("1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#");
		const replay = new Chess();
		replay.loadPgn(pgn);
		expect(replay.isCheckmate()).toBe(true);
	});

	it("throws on an illegal history instead of writing a broken file", () => {
		expect(() => buildPgn({ history: ["e5"], white: "a", black: "b", result: "*" })).toThrow();
	});

	it("maps winners to results", () => {
		expect(resultFromWinner("w")).toBe("1-0");
		expect(resultFromWinner("b")).toBe("0-1");
		expect(resultFromWinner("draw")).toBe("1/2-1/2");
		expect(resultFromWinner(null)).toBe("*");
	});
});
