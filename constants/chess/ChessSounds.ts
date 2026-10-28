import { Color } from "./ChessClock";

// Which sound a chess event makes. The sounds themselves are registered in constants/Sound.tsx (chess* types).

export type MoveSound = "chessMove" | "chessCapture" | "chessCheck" | "chessCastle" | "chessPromote";
export type ResultSound = "chessWin" | "chessLose" | "chessDraw";

/** A check (or mate) wins over everything, then promotion, castling, a capture, and last an ordinary move. */
export function moveSoundFor(san: string): MoveSound {
	if (san.includes("+") || san.includes("#")) return "chessCheck";
	if (san.includes("=")) return "chessPromote";
	if (san.startsWith("O-O")) return "chessCastle";
	if (san.includes("x")) return "chessCapture";
	return "chessMove";
}

/** The jingle at the end of a game; nothing for an aborted game. */
export function resultSoundFor(winner: Color | "draw" | null, myColor: Color): ResultSound | null {
	if (winner === null) return null;
	if (winner === "draw") return "chessDraw";
	return winner === myColor ? "chessWin" : "chessLose";
}

/** The whole second to tick on when a clock is under ten seconds; null otherwise (and at zero). */
export function lowTimeTick(remainingMs: number): number | null {
	if (remainingMs <= 0 || remainingMs >= 10000) return null;
	return Math.ceil(remainingMs / 1000);
}
