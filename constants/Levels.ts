import { atom } from "jotai";
import { Board, BoardBlockType, newEmptyBoard } from "./Board";
import { Color } from "./Color";
import { makeSeededPrng } from "./Hand";

// The level map: 5 chapters of 10 short levels with a clear way to win. Every level is built from its number
// (seeded board and piece order), so a retry is the same level and every device sees the same one.

export type LevelGoal =
	| { kind: "score"; target: number }
	| { kind: "lines"; target: number }
	| { kind: "combo"; target: number }
	| { kind: "gems" };

export interface LevelDef {
	/** "1-1" .. "5-10" */
	id: string;
	chapter: number;
	/** 1..10 inside the chapter */
	index: number;
	/** 1..50 over all chapters */
	number: number;
	goal: LevelGoal;
	/** Limit: moves or seconds (one of them). */
	moves?: number;
	time?: number;
	/** Seed of the board and of the pieces. */
	seed: number;
	/** Pre-filled blocks (gems not counted). */
	blocks: number;
	/** Gem cells to clear (gems goal only). */
	gems: number;
}

export interface ChapterDef {
	chapter: number;
	color: string;
}

export const CHAPTERS: ChapterDef[] = [
	{ chapter: 1, color: "#4CAF50" },
	{ chapter: 2, color: "#29B6F6" },
	{ chapter: 3, color: "#B57CFF" },
	{ chapter: 4, color: "#FF8A3D" },
	{ chapter: 5, color: "#FF4D6A" },
];

export const LEVELS_PER_CHAPTER = 10;
export const LEVEL_BOARD = 8;
export const LEVEL_HAND = 3;

/** The marker color of a gem cell. Pieces never have it (constants/Piece pieceColors). */
export const GEM_COLOR: Color = { r: 120, g: 255, b: 250 };

export function isGemColor(color: Color): boolean {
	"worklet";
	return color.r === GEM_COLOR.r && color.g === GEM_COLOR.g && color.b === GEM_COLOR.b;
}

function lerp(from: number, to: number, t: number): number {
	return Math.round(from + (to - from) * t);
}

/** Builds level n (1..50). */
export function buildLevel(chapter: number, index: number): LevelDef {
	const number = (chapter - 1) * LEVELS_PER_CHAPTER + index;
	const t = (index - 1) / (LEVELS_PER_CHAPTER - 1); // 0 at the first level of a chapter, 1 at the last
	const seed = 7919 * number + 104729;
	const base = { id: `${chapter}-${index}`, chapter, index, number, seed, blocks: 0, gems: 0 };
	switch (chapter) {
		case 1: // basics: score and lines, plenty of moves
			return index % 2 === 1
				? { ...base, goal: { kind: "score", target: lerp(120, 650, t) }, moves: lerp(18, 30, t) }
				: { ...base, goal: { kind: "lines", target: lerp(2, 8, t) }, moves: lerp(18, 30, t) };
		case 2: // gems: clear every gem cell
			return { ...base, goal: { kind: "gems" }, gems: lerp(3, 12, t), blocks: lerp(4, 14, t), moves: lerp(18, 32, t) };
		case 3: // combos: clear lines move after move
			return { ...base, goal: { kind: "combo", target: lerp(2, 5, t) }, blocks: lerp(10, 18, t), moves: lerp(20, 34, t) };
		case 4: // tight: a crowded board, few moves
			return { ...base, goal: { kind: "lines", target: lerp(3, 10, t) }, blocks: lerp(22, 34, t), moves: lerp(14, 26, t) };
		default: // against the clock
			return { ...base, goal: { kind: "score", target: lerp(250, 1200, t) }, blocks: lerp(0, 12, t), time: lerp(60, 75, t) };
	}
}

export const LEVELS: LevelDef[] = CHAPTERS.flatMap(({ chapter }) =>
	Array.from({ length: LEVELS_PER_CHAPTER }, (_, i) => buildLevel(chapter, i + 1)));

export function getLevel(id: string): LevelDef | undefined {
	return LEVELS.find((level) => level.id === id);
}

export function nextLevel(level: LevelDef): LevelDef | undefined {
	return LEVELS[level.number] ?? undefined;
}

const BLOCK_COLORS: Color[] = [
	{ r: 227, g: 143, b: 16 },
	{ r: 186, g: 19, b: 38 },
	{ r: 16, g: 158, b: 40 },
	{ r: 20, g: 56, b: 184 },
	{ r: 101, g: 19, b: 148 },
	{ r: 31, g: 165, b: 222 },
];

/**
 * The start board of a level: pre-filled blocks and gems at seeded places. No row or column is full or one cell
 * short of full, so the first move never clears a line by itself and every line can still be finished.
 */
export function createLevelBoard(level: LevelDef): Board {
	const board = newEmptyBoard(LEVEL_BOARD);
	const prng = makeSeededPrng(level.seed);
	const rows = new Array(LEVEL_BOARD).fill(0);
	const cols = new Array(LEVEL_BOARD).fill(0);
	const place = (count: number, color: () => Color) => {
		let placed = 0;
		for (let attempt = 0; placed < count && attempt < 2000; attempt++) {
			const x = prng.nextInt(0, LEVEL_BOARD - 1);
			const y = prng.nextInt(0, LEVEL_BOARD - 1);
			if (board[y][x].blockType !== BoardBlockType.EMPTY) continue;
			if (rows[y] >= LEVEL_BOARD - 2 || cols[x] >= LEVEL_BOARD - 2) continue;
			board[y][x].blockType = BoardBlockType.FILLED;
			board[y][x].color = color();
			rows[y]++;
			cols[x]++;
			placed++;
		}
	};
	place(level.gems, () => ({ ...GEM_COLOR }));
	place(level.blocks, () => ({ ...BLOCK_COLORS[prng.nextInt(0, BLOCK_COLORS.length - 1)] }));
	return board;
}

export function countGems(board: Board): number {
	"worklet";
	let gems = 0;
	for (let y = 0; y < board.length; y++) {
		for (let x = 0; x < board[y].length; x++) {
			if (board[y][x].blockType === BoardBlockType.FILLED && isGemColor(board[y][x].color)) gems++;
		}
	}
	return gems;
}

/** What a level run has done so far. */
export interface LevelRunState {
	score: number;
	lines: number;
	bestCombo: number;
	gemsLeft: number;
}

export function isLevelGoalMet(level: LevelDef, run: LevelRunState): boolean {
	"worklet";
	const goal = level.goal;
	if (goal.kind === "score") return run.score >= goal.target;
	if (goal.kind === "lines") return run.lines >= goal.target;
	if (goal.kind === "combo") return run.bestCombo >= goal.target;
	return run.gemsLeft <= 0;
}

/** Progress toward the goal as [done, needed]. */
export function levelGoalProgress(level: LevelDef, run: LevelRunState): [number, number] {
	const goal = level.goal;
	if (goal.kind === "score") return [Math.min(run.score, goal.target), goal.target];
	if (goal.kind === "lines") return [Math.min(run.lines, goal.target), goal.target];
	if (goal.kind === "combo") return [Math.min(run.bestCombo, goal.target), goal.target];
	return [level.gems - run.gemsLeft, level.gems];
}

/** Stars for a won level: 1, then 2 with a quarter of the limit left, 3 with half of it. */
export function starsForWin(level: LevelDef, left: number): 1 | 2 | 3 {
	const limit = level.moves ?? level.time ?? 1;
	const share = left / limit;
	return share >= 0.5 ? 3 : share >= 0.25 ? 2 : 1;
}

/** The level being played (set by the map right before the game opens). */
export const currentLevelAtom = atom<string | null>(null);
