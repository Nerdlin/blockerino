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
const ACHIEVEMENT_FLUSH_DELAY_MS = 750;

let cachedAchievementStats: AchievementStats | null = null;
let pendingAchievementProgress: AchievementStats | null = null;
let achievementFlushTimer: ReturnType<typeof setTimeout> | null = null;
let achievementFlushQueue: Promise<void> = Promise.resolve();

function getBestScore(scores: HighScore[]): number {
	return Math.max(0, ...scores.map((score) => score.score));
}

function getBestScoreForMode(scores: HighScore[], mode: GameModeType): number {
	return getBestScore(scores.filter((score) => score.type === mode));
}

function getModeSamplerProgress(scores: HighScore[]): number {
	const completedModes = new Set(
		scores
			.filter((score) => score.score > 0)
			.map((score) => score.type)
	);

	return [
		GameModeType.Classic,
		GameModeType.Chaos,
		GameModeType.DailyPuzzle,
		GameModeType.TimeAttack,
	].filter((mode) => completedModes.has(mode)).length;
}

function getBestScoreTotal(scores: HighScore[]): number {
	return [
		GameModeType.Classic,
		GameModeType.Chaos,
		GameModeType.DailyPuzzle,
		GameModeType.TimeAttack,
	].reduce((total, mode) => total + getBestScoreForMode(scores, mode), 0);
}

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
	{
		id: "first_steps",
		medal: "1",
		title: "First Steps",
		target: 1,
		howToUnlock: "Finish any solo game.",
		getCurrent: (_scores, stats) => stats.soloGamesFinished,
	},
	{
		id: "regular_player",
		medal: "10",
		title: "Regular Player",
		target: 10,
		howToUnlock: "Finish 10 solo games.",
		getCurrent: (_scores, stats) => stats.soloGamesFinished,
	},
	{
		id: "marathoner",
		medal: "50",
		title: "Marathoner",
		target: 50,
		howToUnlock: "Finish 50 solo games.",
		getCurrent: (_scores, stats) => stats.soloGamesFinished,
	},
	{
		id: "score_hunter",
		medal: "1K",
		title: "Score Hunter",
		target: 1000,
		howToUnlock: "Reach 1000 points in one solo game.",
		getCurrent: (scores) => getBestScore(scores),
	},
	{
		id: "block_master",
		medal: "5K",
		title: "Block Master",
		target: 5000,
		howToUnlock: "Reach 5000 points in one solo game.",
		getCurrent: (scores) => getBestScore(scores),
	},
	{
		id: "score_legend",
		medal: "10K",
		title: "Score Legend",
		target: 10000,
		howToUnlock: "Reach 10000 points in one solo game.",
		getCurrent: (scores) => getBestScore(scores),
	},
	{
		id: "line_breaker",
		medal: "50L",
		title: "Line Breaker",
		target: 50,
		howToUnlock: "Clear 50 rows or columns.",
		getCurrent: (_scores, stats) => stats.totalLinesCleared,
	},
	{
		id: "line_crusher",
		medal: "250",
		title: "Line Crusher",
		target: 250,
		howToUnlock: "Clear 250 rows or columns.",
		getCurrent: (_scores, stats) => stats.totalLinesCleared,
	},
	{
		id: "steady_hands",
		medal: "200",
		title: "Steady Hands",
		target: 200,
		howToUnlock: "Place 200 pieces.",
		getCurrent: (_scores, stats) => stats.totalPiecesPlaced,
	},
	{
		id: "piece_architect",
		medal: "1KP",
		title: "Piece Architect",
		target: 1000,
		howToUnlock: "Place 1000 pieces.",
		getCurrent: (_scores, stats) => stats.totalPiecesPlaced,
	},
	{
		id: "comeback",
		medal: "+1",
		title: "Comeback",
		target: 1,
		howToUnlock: "Use an extra chance once.",
		getCurrent: (_scores, stats) => stats.secondChancesUsed,
	},
	{
		id: "second_wind",
		medal: "+5",
		title: "Second Wind",
		target: 5,
		howToUnlock: "Use 5 extra chances.",
		getCurrent: (_scores, stats) => stats.secondChancesUsed,
	},
	{
		id: "classic_riser",
		medal: "CL",
		title: "Classic Riser",
		target: 2500,
		howToUnlock: "Reach 2500 points in Classic.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.Classic),
	},
	{
		id: "chaos_tamer",
		medal: "CH",
		title: "Chaos Tamer",
		target: 1500,
		howToUnlock: "Reach 1500 points in Chaos.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.Chaos),
	},
	{
		id: "chaos_champion",
		medal: "CH+",
		title: "Chaos Champion",
		target: 5000,
		howToUnlock: "Reach 5000 points in Chaos.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.Chaos),
	},
	{
		id: "speed_spark",
		medal: "SP1",
		title: "Speed Spark",
		target: 1000,
		howToUnlock: "Reach 1000 points in Speed mode.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.TimeAttack),
	},
	{
		id: "speed_streak",
		medal: "SP2",
		title: "Speed Streak",
		target: 2500,
		howToUnlock: "Reach 2500 points in Speed mode.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.TimeAttack),
	},
	{
		id: "daily_solver",
		medal: "DAY",
		title: "Daily Solver",
		target: 1000,
		howToUnlock: "Reach 1000 points in Daily Puzzle.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.DailyPuzzle),
	},
	{
		id: "mode_sampler",
		medal: "ALL",
		title: "Mode Sampler",
		target: 4,
		howToUnlock: "Score in every solo mode.",
		getCurrent: (scores) => getModeSamplerProgress(scores),
	},
	{
		id: "score_collector",
		medal: "TOT",
		title: "Score Collector",
		target: 5000,
		howToUnlock: "Build a 5000-point best-score total across modes.",
		getCurrent: (scores) => getBestScoreTotal(scores),
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

function mergeAchievementProgress(base: AchievementStats, progress: Partial<AchievementStats>): AchievementStats {
	return {
		soloGamesFinished: base.soloGamesFinished + (progress.soloGamesFinished || 0),
		totalLinesCleared: base.totalLinesCleared + (progress.totalLinesCleared || 0),
		totalPiecesPlaced: base.totalPiecesPlaced + (progress.totalPiecesPlaced || 0),
		secondChancesUsed: base.secondChancesUsed + (progress.secondChancesUsed || 0),
	};
}

async function readStoredAchievementStats(): Promise<AchievementStats> {
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

export async function flushAchievementProgress(): Promise<void> {
	if (achievementFlushTimer) {
		clearTimeout(achievementFlushTimer);
		achievementFlushTimer = null;
	}

	if (!pendingAchievementProgress) {
		await achievementFlushQueue;
		return;
	}

	const progressToFlush = pendingAchievementProgress;
	pendingAchievementProgress = null;

	achievementFlushQueue = achievementFlushQueue.catch(() => undefined).then(async () => {
		const current = cachedAchievementStats ?? await readStoredAchievementStats();
		const next = mergeAchievementProgress(current, progressToFlush);
		cachedAchievementStats = next;
		await AsyncStorage.setItem(ACHIEVEMENT_STATS_KEY, JSON.stringify(next));
	});

	await achievementFlushQueue;
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
	await flushAchievementProgress();
	if (!cachedAchievementStats) {
		cachedAchievementStats = await readStoredAchievementStats();
	}

	return cachedAchievementStats;
}

export async function recordAchievementProgress(progress: Partial<AchievementStats>): Promise<void> {
	pendingAchievementProgress = mergeAchievementProgress(
		pendingAchievementProgress ?? getDefaultAchievementStats(),
		progress
	);

	if (!achievementFlushTimer) {
		achievementFlushTimer = setTimeout(() => {
			void flushAchievementProgress().catch((error) => {
				console.error("Error saving achievement stats:", error);
			});
		}, ACHIEVEMENT_FLUSH_DELAY_MS);
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
