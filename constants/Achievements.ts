import AsyncStorage from "@react-native-async-storage/async-storage";
import { GameModeType } from "@/hooks/useAppState";
import { getHighScores, HighScore } from "@/constants/Storage";

export interface AchievementStats {
	soloGamesFinished: number;
	totalLinesCleared: number;
	totalPiecesPlaced: number;
	secondChancesUsed: number;
}

export interface AchievementDefinition {
	id: string;
	medal: string;
	title: string;
	target: number;
	howToUnlock: string;
	getCurrent: (scores: HighScore[], stats: AchievementStats) => number;
}

export interface AchievementRow extends AchievementDefinition {
	progress: {
		current: number;
		target: number;
		complete: boolean;
	};
}

const ACHIEVEMENT_STATS_KEY = "ACHIEVEMENT_STATS";

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
	{
		id: "first_steps",
		medal: "🥉",
		title: "First Steps",
		target: 1,
		howToUnlock: "Finish any solo game.",
		getCurrent: (_scores, stats) => stats.soloGamesFinished,
	},
	{
		id: "score_hunter",
		medal: "🥈",
		title: "Score Hunter",
		target: 1000,
		howToUnlock: "Reach 1000 points in one solo game.",
		getCurrent: (scores) => Math.max(0, ...scores.map((score) => score.score)),
	},
	{
		id: "block_master",
		medal: "🥇",
		title: "Block Master",
		target: 5000,
		howToUnlock: "Reach 5000 points in one solo game.",
		getCurrent: (scores) => Math.max(0, ...scores.map((score) => score.score)),
	},
	{
		id: "line_breaker",
		medal: "🏅",
		title: "Line Breaker",
		target: 50,
		howToUnlock: "Clear 50 rows or columns.",
		getCurrent: (_scores, stats) => stats.totalLinesCleared,
	},
	{
		id: "steady_hands",
		medal: "🎖️",
		title: "Steady Hands",
		target: 200,
		howToUnlock: "Place 200 pieces.",
		getCurrent: (_scores, stats) => stats.totalPiecesPlaced,
	},
	{
		id: "comeback",
		medal: "🏆",
		title: "Comeback",
		target: 1,
		howToUnlock: "Use an extra chance once.",
		getCurrent: (_scores, stats) => stats.secondChancesUsed,
	},
	{
		id: "chaos_tamer",
		medal: "💎",
		title: "Chaos Tamer",
		target: 1500,
		howToUnlock: "Reach 1500 points in Chaos.",
		getCurrent: (scores) => Math.max(0, ...scores.filter((score) => score.type === GameModeType.Chaos).map((score) => score.score)),
	},
	{
		id: "speed_spark",
		medal: "⚡",
		title: "Speed Spark",
		target: 1000,
		howToUnlock: "Reach 1000 points in Speed mode.",
		getCurrent: (scores) => Math.max(0, ...scores.filter((score) => score.type === GameModeType.TimeAttack).map((score) => score.score)),
	},
];

export function getDefaultAchievementStats(): AchievementStats {
	return {
		soloGamesFinished: 0,
		totalLinesCleared: 0,
		totalPiecesPlaced: 0,
		secondChancesUsed: 0,
	};
}

export function buildAchievementRows(scores: HighScore[], stats: AchievementStats): AchievementRow[] {
	return ACHIEVEMENT_DEFINITIONS.map((definition) => {
		const current = Math.max(0, Math.floor(definition.getCurrent(scores, stats)));
		return {
			...definition,
			progress: {
				current,
				target: definition.target,
				complete: current >= definition.target,
			},
		};
	});
}

export async function getAchievementStats(): Promise<AchievementStats> {
	try {
		const value = await AsyncStorage.getItem(ACHIEVEMENT_STATS_KEY);
		if (!value) return getDefaultAchievementStats();

		return {
			...getDefaultAchievementStats(),
			...JSON.parse(value),
		};
	} catch (error) {
		console.error("Error loading achievement stats:", error);
		return getDefaultAchievementStats();
	}
}

export async function recordAchievementProgress(progress: Partial<AchievementStats>): Promise<void> {
	try {
		const current = await getAchievementStats();
		const next: AchievementStats = {
			soloGamesFinished: current.soloGamesFinished + (progress.soloGamesFinished || 0),
			totalLinesCleared: current.totalLinesCleared + (progress.totalLinesCleared || 0),
			totalPiecesPlaced: current.totalPiecesPlaced + (progress.totalPiecesPlaced || 0),
			secondChancesUsed: current.secondChancesUsed + (progress.secondChancesUsed || 0),
		};

		await AsyncStorage.setItem(ACHIEVEMENT_STATS_KEY, JSON.stringify(next));
	} catch (error) {
		console.error("Error saving achievement stats:", error);
	}
}

export async function getAchievementRows(): Promise<AchievementRow[]> {
	const stats = await getAchievementStats();
	const scoreGroups = await Promise.all([
		getHighScores(GameModeType.Classic, true, true),
		getHighScores(GameModeType.Chaos, true, true),
		getHighScores(GameModeType.DailyPuzzle, true, true),
		getHighScores(GameModeType.TimeAttack, true, true),
	]);

	return buildAchievementRows(scoreGroups.flat(), stats);
}
