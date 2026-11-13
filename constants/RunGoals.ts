import { GameModeType } from "@/hooks/useAppState";

// What a run of an endless mode is played for: medals at fixed scores, the player's record, friends' records.
// Also how hard the pieces get as the score grows, and when the board counts as "in danger".

export type MedalId = "bronze" | "silver" | "gold";

export interface Medal {
	id: MedalId;
	score: number;
	/** Coins given once per run for reaching it (the best medal of the run pays). */
	coins: number;
}

// Picked from real records: the median best is about 950 in Classic, a quarter of players passed 2000, a tenth 5500.
const MEDALS: Partial<Record<GameModeType, Medal[]>> = {
	[GameModeType.Classic]: [
		{ id: "bronze", score: 500, coins: 10 },
		{ id: "silver", score: 2000, coins: 25 },
		{ id: "gold", score: 6000, coins: 60 },
	],
	[GameModeType.Chaos]: [
		{ id: "bronze", score: 1000, coins: 10 },
		{ id: "silver", score: 5000, coins: 25 },
		{ id: "gold", score: 15000, coins: 60 },
	],
};

export function getMedals(gameMode: GameModeType): Medal[] {
	return MEDALS[gameMode] ?? [];
}

/** Modes with medals, goals on screen, growing difficulty and the danger signal. */
export function hasRunGoals(gameMode: GameModeType): boolean {
	return getMedals(gameMode).length > 0;
}

/** The best medal a score earns, or null. */
export function getMedalForScore(gameMode: GameModeType, score: number): Medal | null {
	let best: Medal | null = null;
	for (const medal of getMedals(gameMode)) {
		if (score >= medal.score) best = medal;
	}
	return best;
}

export function getNextMedal(gameMode: GameModeType, score: number): Medal | null {
	return getMedals(gameMode).find((medal) => score < medal.score) ?? null;
}

export type RunGoalKind = MedalId | "record" | "friend";

export interface RunGoal {
	kind: RunGoalKind;
	score: number;
	/** The friend's name for a "friend" goal. */
	name?: string;
}

export interface FriendBest {
	name: string;
	score: number;
}

/**
 * Every goal of a run, lowest first. A goal is passed when the score is strictly above a record (beating it) or
 * reaches a medal. Goals at the same score keep one: the record, then a friend, then the medal.
 */
export function buildRunGoals(gameMode: GameModeType, previousBest: number, friends: FriendBest[] = []): RunGoal[] {
	const goals: RunGoal[] = [];
	if (previousBest > 0) goals.push({ kind: "record", score: previousBest + 1 });
	for (const friend of friends) {
		if (friend.score > 0 && friend.score >= previousBest) goals.push({ kind: "friend", score: friend.score + 1, name: friend.name });
	}
	for (const medal of getMedals(gameMode)) goals.push({ kind: medal.id, score: medal.score });

	const order = (goal: RunGoal) => (goal.kind === "record" ? 0 : goal.kind === "friend" ? 1 : 2);
	goals.sort((a, b) => a.score - b.score || order(a) - order(b));
	return goals.filter((goal, index) => index === 0 || goals[index - 1].score !== goal.score);
}

/** The first goal the score has not reached yet, with the score the previous goal stood at (for the progress bar). */
export function getCurrentGoal(goals: RunGoal[], score: number): { goal: RunGoal; from: number; index: number } | null {
	for (let i = 0; i < goals.length; i++) {
		if (score < goals[i].score) return { goal: goals[i], from: i > 0 ? goals[i - 1].score : 0, index: i };
	}
	return null;
}

// Difficulty: 0 while the run is young, 1 from the gold medal on.

export function getDifficulty(gameMode: string | undefined, score: number): number {
	"worklet";
	// (plain literals: this also runs on the UI thread)
	const start = gameMode === "classic" ? 300 : gameMode === "chaos" ? 600 : -1;
	const full = gameMode === "classic" ? 6000 : gameMode === "chaos" ? 15000 : -1;
	if (start < 0 || score <= start) return 0;
	if (score >= full) return 1;
	return (score - start) / (full - start);
}

/** The board is "in danger" when this share of it is filled. */
export const DANGER_FILL_RATIO = 0.62;

export function isDangerFill(filledCells: number, totalCells: number): boolean {
	"worklet";
	return totalCells > 0 && filledCells / totalCells >= DANGER_FILL_RATIO;
}
