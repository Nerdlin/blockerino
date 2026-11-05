import AsyncStorage from "@react-native-async-storage/async-storage";
import { GameModeType } from "@/hooks/useAppState";
import { getHighScores } from "@/constants/Storage";
import { noteAchievementHighWater } from "@/constants/Achievements";
import { submitDailyPuzzleScore } from "@/constants/Supabase";

// Goals of the challenges: three stars per challenge for reaching a score, a Daily Puzzle streak and the best score of
// each puzzle day. Everything is kept on the device; the day's best also goes to the Daily Puzzle board of that day.

/** Score for one, two and three stars. The Daily Puzzle counts today's best; the others the all-time best. */
export const CHALLENGE_GOALS: Record<string, readonly [number, number, number]> = {
	[GameModeType.DailyPuzzle]: [100, 250, 500],
	[GameModeType.TimeAttack]: [1000, 3000, 6000],
	[GameModeType.MoveLimit]: [300, 700, 1200],
	[GameModeType.Rescue]: [1000, 3000, 6000],
	[GameModeType.ComboTrial]: [300, 800, 1500],
};

export const CHALLENGE_MODES = Object.keys(CHALLENGE_GOALS) as GameModeType[];
export const MAX_CHALLENGE_STARS = CHALLENGE_MODES.length * 3;

const DAILY_DAYS_KEY = "DAILY_PUZZLE_DAYS";
const KEEP_DAYS = 60;

export function isChallengeMode(mode: GameModeType): boolean {
	return mode in CHALLENGE_GOALS;
}

export function starsForScore(mode: GameModeType, score: number): number {
	const goals = CHALLENGE_GOALS[mode];
	return goals ? goals.filter((goal) => score >= goal).length : 0;
}

/** The score of the next star, or null when all three are earned. */
export function nextGoal(mode: GameModeType, score: number): number | null {
	return CHALLENGE_GOALS[mode]?.find((goal) => score < goal) ?? null;
}

/** The puzzle day of a date: the local calendar date, the same key the Daily Puzzle is seeded with (constants/Hand.tsx). */
export function puzzleDayKey(date: Date = new Date()): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function previousDayKey(key: string): string {
	const [year, month, day] = key.split("-").map(Number);
	return puzzleDayKey(new Date(year, month - 1, day - 1));
}

/** Days in a row with a Daily Puzzle played, ending today (or yesterday, while today's is still to play). */
export function dailyStreak(days: Record<string, number>, todayKey: string = puzzleDayKey()): number {
	let key = days[todayKey] ? todayKey : previousDayKey(todayKey);
	let streak = 0;
	while (days[key]) {
		streak += 1;
		key = previousDayKey(key);
	}
	return streak;
}

/** Milliseconds until the next local midnight, when the next Daily Puzzle opens. */
export function msUntilNextPuzzle(now: Date = new Date()): number {
	const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
	return midnight.getTime() - now.getTime();
}

export async function getDailyPuzzleDays(): Promise<Record<string, number>> {
	try {
		const raw = await AsyncStorage.getItem(DAILY_DAYS_KEY);
		const parsed = raw ? JSON.parse(raw) : {};
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
}

export interface ChallengeOverview {
	/** Best score per challenge (today's for the Daily Puzzle). */
	best: Partial<Record<GameModeType, number>>;
	stars: number;
	dailyStreak: number;
}

/** Stars across the challenges: the all-time bests and today's Daily Puzzle. */
export function countChallengeStars(best: Partial<Record<GameModeType, number>>): number {
	return CHALLENGE_MODES.reduce((total, mode) => total + starsForScore(mode, best[mode] ?? 0), 0);
}

export async function getChallengeOverview(extra?: { mode: GameModeType; score: number }): Promise<ChallengeOverview> {
	const days = await getDailyPuzzleDays();
	const today = puzzleDayKey();
	const entries = await Promise.all(CHALLENGE_MODES.map(async (mode) => {
		if (mode === GameModeType.DailyPuzzle) return [mode, days[today] ?? 0] as const;
		const scores = await getHighScores(mode, true, true, 1);
		return [mode, scores[0]?.score ?? 0] as const;
	}));
	const best: Partial<Record<GameModeType, number>> = Object.fromEntries(entries);
	if (extra && extra.mode !== GameModeType.DailyPuzzle) best[extra.mode] = Math.max(best[extra.mode] ?? 0, extra.score);
	return { best, stars: countChallengeStars(best), dailyStreak: dailyStreak(days, today) };
}

/** Called once per finished challenge game: today's Daily Puzzle best, the streak and the star count. */
export async function recordChallengeResult(mode: GameModeType, score: number): Promise<void> {
	if (!isChallengeMode(mode) || !(score > 0)) return;
	if (mode === GameModeType.DailyPuzzle) {
		const today = puzzleDayKey();
		const days = await getDailyPuzzleDays();
		days[today] = Math.max(days[today] ?? 0, Math.floor(score));
		const kept = Object.fromEntries(Object.entries(days).sort(([a], [b]) => b.localeCompare(a)).slice(0, KEEP_DAYS));
		await AsyncStorage.setItem(DAILY_DAYS_KEY, JSON.stringify(kept));
		void submitDailyPuzzleScore(today, kept[today]);
	}
	const overview = await getChallengeOverview({ mode, score });
	noteAchievementHighWater("challengeStars", overview.stars);
	noteAchievementHighWater("dailyStreakBest", overview.dailyStreak);
}
