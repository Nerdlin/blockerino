import { Chess } from "chess.js";

export type ChessResult = "1-0" | "0-1" | "1/2-1/2" | "*";

export interface PgnInput {
	/** Moves in SAN, as the game keeps them. */
	history: string[];
	white: string;
	black: string;
	result: ChessResult;
	/** Written as the TimeControl tag, e.g. "180+2". */
	timeControl?: string;
	whiteElo?: number;
	blackElo?: number;
	date?: Date;
	termination?: string;
	event?: string;
}

function pgnDate(date: Date): string {
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");
	return `${date.getUTCFullYear()}.${month}.${day}`;
}

/** A standard PGN that any chess app can open. Replays the moves, so an illegal history throws. */
export function buildPgn(input: PgnInput): string {
	const chess = new Chess();
	for (const move of input.history) chess.move(move);
	const headers: Record<string, string> = {
		Event: input.event ?? "Blockerino casual game",
		Site: "https://blockerino.aionerdlin.me",
		Date: pgnDate(input.date ?? new Date()),
		White: input.white,
		Black: input.black,
		Result: input.result,
	};
	if (input.whiteElo) headers.WhiteElo = String(input.whiteElo);
	if (input.blackElo) headers.BlackElo = String(input.blackElo);
	if (input.timeControl) headers.TimeControl = input.timeControl;
	if (input.termination) headers.Termination = input.termination;
	for (const [key, value] of Object.entries(headers)) chess.setHeader(key, value);
	return chess.pgn();
}

/** "1-0" when White won, "0-1" when Black won, "1/2-1/2" for a draw; "*" while the game is on. */
export function resultFromWinner(winner: "w" | "b" | "draw" | null): ChessResult {
	if (winner === "w") return "1-0";
	if (winner === "b") return "0-1";
	if (winner === "draw") return "1/2-1/2";
	return "*";
}
