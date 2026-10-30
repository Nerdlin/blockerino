import AsyncStorage from "@react-native-async-storage/async-storage";
import { Chess } from "chess.js";

// Chess puzzles from the Lichess puzzle database (CC0, database.lichess.org), a small spread by rating built by
// scripts/build-chess-puzzles.py into assets/chess/puzzles.json. As on Lichess, a puzzle's position is the one
// before the opponent's last move: that move is played first, then the player has to find the rest. Each row is
// [id, fen, uci moves, rating, themes].

export type PuzzleRow = [string, string, string, number, string[]];

export interface Puzzle {
	id: string;
	fen: string;
	/** UCI moves: the opponent's setup move, then the player's and the opponent's replies alternately. */
	moves: string[];
	rating: number;
	themes: string[];
}

export interface PuzzleProgress {
	rating: number;
	solved: string[];
	streak: number;
}

const PROGRESS_KEY = "CHESS_PUZZLES_V1";
export const START_PUZZLE_RATING = 800;
const K = 32;

export function parsePuzzles(rows: PuzzleRow[]): Puzzle[] {
	return rows.map(([id, fen, moves, rating, themes]) => ({ id, fen, moves: moves.split(" "), rating, themes }));
}

function playUci(chess: Chess, uci: string) {
	return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined });
}

export interface PuzzlePosition {
	fen: string;
	/** SAN of the moves played from the puzzle's start, for the move list and the board's slide animation. */
	history: string[];
	/** Index into puzzle.moves of the move the player has to find next. */
	step: number;
	playerColor: "w" | "b";
	lastMove: { from: string; to: string } | null;
}

/** The position the player first sees: the opponent's setup move is already played. */
export function startPuzzle(puzzle: Puzzle): PuzzlePosition {
	const chess = new Chess(puzzle.fen);
	const setup = playUci(chess, puzzle.moves[0]);
	return { fen: chess.fen(), history: [setup.san], step: 1, playerColor: chess.turn(), lastMove: { from: setup.from, to: setup.to } };
}

export type PuzzleAnswer =
	| { result: "wrong" }
	| { result: "correct"; position: PuzzlePosition }
	| { result: "solved"; position: PuzzlePosition };

/**
 * Checks the player's move. The expected move is right, and so is any other move that mates (Lichess accepts those
 * too). After a right move that is not the last one, the opponent's reply is played at once.
 */
export function answerPuzzle(puzzle: Puzzle, position: PuzzlePosition, uci: string): PuzzleAnswer {
	const chess = new Chess(position.fen);
	let played;
	try {
		played = playUci(chess, uci);
	} catch {
		return { result: "wrong" };
	}
	const expected = puzzle.moves[position.step];
	if (uci !== expected && !chess.isCheckmate()) return { result: "wrong" };

	const history = [...position.history, played.san];
	const next = position.step + 1;
	if (next >= puzzle.moves.length || chess.isCheckmate()) {
		return { result: "solved", position: { ...position, fen: chess.fen(), history, step: next, lastMove: { from: played.from, to: played.to } } };
	}
	const reply = playUci(chess, puzzle.moves[next]);
	return {
		result: "correct",
		position: { ...position, fen: chess.fen(), history: [...history, reply.san], step: next + 1, lastMove: { from: reply.from, to: reply.to } },
	};
}

/** The player's puzzle rating after a puzzle: an Elo step against the puzzle's own rating. */
export function nextPuzzleRating(rating: number, puzzleRating: number, solved: boolean): number {
	const expected = 1 / (1 + 10 ** ((puzzleRating - rating) / 400));
	const next = Math.round(rating + K * ((solved ? 1 : 0) - expected));
	return Math.min(3000, Math.max(400, next));
}

/** An unsolved puzzle near the player's rating, picked at random among the closest few. */
export function pickPuzzle(puzzles: Puzzle[], rating: number, solved: readonly string[], random = Math.random): Puzzle | null {
	const done = new Set(solved);
	const open = puzzles.filter((puzzle) => !done.has(puzzle.id));
	const pool = (open.length ? open : puzzles).slice().sort((a, b) => Math.abs(a.rating - rating) - Math.abs(b.rating - rating)).slice(0, 12);
	return pool.length ? pool[Math.floor(random() * pool.length)] : null;
}

export async function loadPuzzleProgress(): Promise<PuzzleProgress> {
	try {
		const raw = await AsyncStorage.getItem(PROGRESS_KEY);
		const parsed = raw ? (JSON.parse(raw) as Partial<PuzzleProgress>) : {};
		return {
			rating: typeof parsed.rating === "number" ? parsed.rating : START_PUZZLE_RATING,
			solved: Array.isArray(parsed.solved) ? parsed.solved.filter((id): id is string => typeof id === "string") : [],
			streak: typeof parsed.streak === "number" ? parsed.streak : 0,
		};
	} catch {
		return { rating: START_PUZZLE_RATING, solved: [], streak: 0 };
	}
}

export async function savePuzzleProgress(progress: PuzzleProgress): Promise<void> {
	try {
		await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify({ ...progress, solved: progress.solved.slice(-2000) }));
	} catch {
		// progress is a convenience; losing it only means seeing old puzzles again
	}
}
