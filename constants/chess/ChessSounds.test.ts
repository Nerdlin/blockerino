import { lowTimeTick, moveSoundFor, resultSoundFor } from "./ChessSounds";

describe("chess sounds", () => {
	it("picks the move sound by what the move did", () => {
		expect(moveSoundFor("e4")).toBe("chessMove");
		expect(moveSoundFor("Nf3")).toBe("chessMove");
		expect(moveSoundFor("exd5")).toBe("chessCapture");
		expect(moveSoundFor("Bxf7")).toBe("chessCapture");
		expect(moveSoundFor("O-O")).toBe("chessCastle");
		expect(moveSoundFor("O-O-O")).toBe("chessCastle");
		expect(moveSoundFor("a8=Q")).toBe("chessPromote");
		expect(moveSoundFor("Qh5+")).toBe("chessCheck");
		expect(moveSoundFor("Qxf7#")).toBe("chessCheck");
		expect(moveSoundFor("axb8=Q+")).toBe("chessCheck");
	});

	it("picks the result jingle for the player's side", () => {
		expect(resultSoundFor("w", "w")).toBe("chessWin");
		expect(resultSoundFor("b", "w")).toBe("chessLose");
		expect(resultSoundFor("draw", "b")).toBe("chessDraw");
		expect(resultSoundFor(null, "w")).toBeNull();
	});

	it("ticks once per second under ten seconds", () => {
		expect(lowTimeTick(10000)).toBeNull();
		expect(lowTimeTick(9999)).toBe(10);
		expect(lowTimeTick(9000)).toBe(9);
		expect(lowTimeTick(1)).toBe(1);
		expect(lowTimeTick(0)).toBeNull();
		expect(lowTimeTick(-5)).toBeNull();
	});
});
