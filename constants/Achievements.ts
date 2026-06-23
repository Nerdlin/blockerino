import AsyncStorage from "@react-native-async-storage/async-storage";
import { GameModeType } from "@/hooks/useAppState";
import { getHighScores, HighScore } from "@/constants/Storage";
import { LEADERBOARD_GAME_MODES } from "@/constants/GameModes";

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

	return LEADERBOARD_GAME_MODES.filter((mode) => completedModes.has(mode)).length;
}

function getBestScoreTotal(scores: HighScore[]): number {
	return LEADERBOARD_GAME_MODES.reduce((total, mode) => total + getBestScoreForMode(scores, mode), 0);
}

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
	{
		id: "first_steps",
		medal: "👣",
		title: "First Steps",
		target: 1,
		howToUnlock: "Finish any solo game.",
		getCurrent: (_scores, stats) => stats.soloGamesFinished,
	},
	{
		id: "regular_player",
		medal: "🎮",
		title: "Regular Player",
		target: 10,
		howToUnlock: "Finish 10 solo games.",
		getCurrent: (_scores, stats) => stats.soloGamesFinished,
	},
	{
		id: "marathoner",
		medal: "🏃",
		title: "Marathoner",
		target: 50,
		howToUnlock: "Finish 50 solo games.",
		getCurrent: (_scores, stats) => stats.soloGamesFinished,
	},
	{
		id: "score_hunter",
		medal: "🎯",
		title: "Score Hunter",
		target: 1000,
		howToUnlock: "Reach 1000 points in one solo game.",
		getCurrent: (scores) => getBestScore(scores),
	},
	{
		id: "block_master",
		medal: "🧱",
		title: "Block Master",
		target: 5000,
		howToUnlock: "Reach 5000 points in one solo game.",
		getCurrent: (scores) => getBestScore(scores),
	},
	{
		id: "score_legend",
		medal: "🏆",
		title: "Score Legend",
		target: 10000,
		howToUnlock: "Reach 10000 points in one solo game.",
		getCurrent: (scores) => getBestScore(scores),
	},
	{
		id: "line_breaker",
		medal: "⚡",
		title: "Line Breaker",
		target: 50,
		howToUnlock: "Clear 50 rows or columns.",
		getCurrent: (_scores, stats) => stats.totalLinesCleared,
	},
	{
		id: "line_crusher",
		medal: "💥",
		title: "Line Crusher",
		target: 250,
		howToUnlock: "Clear 250 rows or columns.",
		getCurrent: (_scores, stats) => stats.totalLinesCleared,
	},
	{
		id: "steady_hands",
		medal: "✋",
		title: "Steady Hands",
		target: 200,
		howToUnlock: "Place 200 pieces.",
		getCurrent: (_scores, stats) => stats.totalPiecesPlaced,
	},
	{
		id: "piece_architect",
		medal: "🏗️",
		title: "Piece Architect",
		target: 1000,
		howToUnlock: "Place 1000 pieces.",
		getCurrent: (_scores, stats) => stats.totalPiecesPlaced,
	},
	{
		id: "comeback",
		medal: "🔁",
		title: "Comeback",
		target: 1,
		howToUnlock: "Use an extra chance once.",
		getCurrent: (_scores, stats) => stats.secondChancesUsed,
	},
	{
		id: "second_wind",
		medal: "🍃",
		title: "Second Wind",
		target: 5,
		howToUnlock: "Use 5 extra chances.",
		getCurrent: (_scores, stats) => stats.secondChancesUsed,
	},
	{
		id: "classic_riser",
		medal: "🎲",
		title: "Classic Riser",
		target: 2500,
		howToUnlock: "Reach 2500 points in Classic.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.Classic),
	},
	{
		id: "chaos_tamer",
		medal: "🌀",
		title: "Chaos Tamer",
		target: 1500,
		howToUnlock: "Reach 1500 points in Chaos.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.Chaos),
	},
	{
		id: "chaos_champion",
		medal: "🌪️",
		title: "Chaos Champion",
		target: 5000,
		howToUnlock: "Reach 5000 points in Chaos.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.Chaos),
	},
	{
		id: "speed_spark",
		medal: "⚡",
		title: "Speed Spark",
		target: 1000,
		howToUnlock: "Reach 1000 points in Speed mode.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.TimeAttack),
	},
	{
		id: "speed_streak",
		medal: "🚀",
		title: "Speed Streak",
		target: 2500,
		howToUnlock: "Reach 2500 points in Speed mode.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.TimeAttack),
	},
	{
		id: "daily_solver",
		medal: "📅",
		title: "Daily Solver",
		target: 1000,
		howToUnlock: "Reach 1000 points in Daily Puzzle.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.DailyPuzzle),
	},
	{
		id: "move_planner",
		medal: "🧠",
		title: "Move Planner",
		target: 1000,
		howToUnlock: "Reach 1000 points in Move Limit.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.MoveLimit),
	},
	{
		id: "mode_sampler",
		medal: "🧩",
		title: "Mode Sampler",
		target: LEADERBOARD_GAME_MODES.length,
		howToUnlock: "Score in every solo mode.",
		getCurrent: (scores) => getModeSamplerProgress(scores),
	},
	{
		id: "score_collector",
		medal: "💰",
		title: "Score Collector",
		target: 5000,
		howToUnlock: "Build a 5000-point best-score total across modes.",
		getCurrent: (scores) => getBestScoreTotal(scores),
	},
	{
		id: "solo_grinder",
		medal: "🥉",
		title: "Solo Grinder",
		target: 100,
		howToUnlock: "Finish 100 solo games.",
		getCurrent: (_scores, stats) => stats.soloGamesFinished,
	},
	{
		id: "solo_veteran",
		medal: "🎖️",
		title: "Solo Veteran",
		target: 250,
		howToUnlock: "Finish 250 solo games.",
		getCurrent: (_scores, stats) => stats.soloGamesFinished,
	},
	{
		id: "line_engineer",
		medal: "⚙️",
		title: "Line Engineer",
		target: 500,
		howToUnlock: "Clear 500 rows or columns.",
		getCurrent: (_scores, stats) => stats.totalLinesCleared,
	},
	{
		id: "line_tycoon",
		medal: "🔗",
		title: "Line Tycoon",
		target: 1000,
		howToUnlock: "Clear 1000 rows or columns.",
		getCurrent: (_scores, stats) => stats.totalLinesCleared,
	},
	{
		id: "line_myth",
		medal: "🌟",
		title: "Line Myth",
		target: 2500,
		howToUnlock: "Clear 2500 rows or columns.",
		getCurrent: (_scores, stats) => stats.totalLinesCleared,
	},
	{
		id: "piece_builder",
		medal: "🏛️",
		title: "Piece Builder",
		target: 2500,
		howToUnlock: "Place 2500 pieces.",
		getCurrent: (_scores, stats) => stats.totalPiecesPlaced,
	},
	{
		id: "piece_factory",
		medal: "🏭",
		title: "Piece Factory",
		target: 5000,
		howToUnlock: "Place 5000 pieces.",
		getCurrent: (_scores, stats) => stats.totalPiecesPlaced,
	},
	{
		id: "piece_city",
		medal: "🌆",
		title: "Piece City",
		target: 10000,
		howToUnlock: "Place 10000 pieces.",
		getCurrent: (_scores, stats) => stats.totalPiecesPlaced,
	},
	{
		id: "score_titan",
		medal: "⭐",
		title: "Score Titan",
		target: 25000,
		howToUnlock: "Reach 25000 points in one solo game.",
		getCurrent: (scores) => getBestScore(scores),
	},
	{
		id: "score_myth",
		medal: "💫",
		title: "Score Myth",
		target: 50000,
		howToUnlock: "Reach 50000 points in one solo game.",
		getCurrent: (scores) => getBestScore(scores),
	},
	{
		id: "classic_peak",
		medal: "♟️",
		title: "Classic Peak",
		target: 10000,
		howToUnlock: "Reach 10000 points in Classic.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.Classic),
	},
	{
		id: "classic_orbit",
		medal: "🎴",
		title: "Classic Orbit",
		target: 20000,
		howToUnlock: "Reach 20000 points in Classic.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.Classic),
	},
	{
		id: "chaos_overlord",
		medal: "🌋",
		title: "Chaos Overlord",
		target: 10000,
		howToUnlock: "Reach 10000 points in Chaos.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.Chaos),
	},
	{
		id: "speed_flash",
		medal: "⏱️",
		title: "Speed Flash",
		target: 5000,
		howToUnlock: "Reach 5000 points in Speed mode.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.TimeAttack),
	},
	{
		id: "speed_blazer",
		medal: "💨",
		title: "Speed Blazer",
		target: 7500,
		howToUnlock: "Reach 7500 points in Speed mode.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.TimeAttack),
	},
	{
		id: "daily_regular",
		medal: "📆",
		title: "Daily Regular",
		target: 2500,
		howToUnlock: "Reach 2500 points in Daily Puzzle.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.DailyPuzzle),
	},
	{
		id: "daily_elite",
		medal: "🗓️",
		title: "Daily Elite",
		target: 5000,
		howToUnlock: "Reach 5000 points in Daily Puzzle.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.DailyPuzzle),
	},
	{
		id: "move_tactician",
		medal: "🧭",
		title: "Move Tactician",
		target: 2000,
		howToUnlock: "Reach 2000 points in Move Limit.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.MoveLimit),
	},
	{
		id: "move_mastermind",
		medal: "👑",
		title: "Move Mastermind",
		target: 4000,
		howToUnlock: "Reach 4000 points in Move Limit.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.MoveLimit),
	},
	{
		id: "score_vault",
		medal: "🏦",
		title: "Score Vault",
		target: 15000,
		howToUnlock: "Build a 15000-point best-score total across modes.",
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
	const scoreGroups = await Promise.all(
		LEADERBOARD_GAME_MODES.map((mode) => getHighScores(mode, true, true))
	);

	return buildAchievementRows(scoreGroups.flat(), stats);
}
