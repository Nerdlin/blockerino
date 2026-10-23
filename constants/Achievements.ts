import AsyncStorage from "@react-native-async-storage/async-storage";
import { recordQuestProgress } from "./DailyQuests";
import { recordGameOutcome } from "./GameStats";
import { GameModeType } from "@/hooks/useAppState";
import { getHighScores, HighScore } from "@/constants/Storage";
import { LEADERBOARD_GAME_MODES } from "@/constants/GameModes";

export interface AchievementStats {
	soloGamesFinished: number;
	totalLinesCleared: number;
	totalPiecesPlaced: number;
	secondChancesUsed: number;
	versusWins: number;
	versusPlayed: number;
	chessWins: number;
	seaWins: number;
	durakWins: number;
	tictactoeWins: number;
	sudokuSolved: number;
	mahjongCleared: number;
	botWins: number;
	botHardWins: number;
	/** Highest coin balance ever seen on this device (a high-water mark, not a sum). */
	peakCoins: number;
	/** Longest daily login streak ever seen on this device (a high-water mark, not a sum). */
	streakBest: number;
}

export type AchievementGroup = "solo" | "versus" | "games" | "economy";

export interface AchievementDefinition {
	id: string;
	/** Achievements of one chain are tiers of the same goal (10 games, 50 games, ...), easiest first. */
	chain: string;
	/** Coins paid by the server when the tier is claimed. */
	reward: number;
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

/** How many different games the player has won at least once (Versus, chess, Sea Battle, Durak, Tic-Tac-Toe, Sudoku, Mahjong). */
export function getGameHopperProgress(stats: AchievementStats): number {
	return [stats.versusWins, stats.chessWins, stats.seaWins, stats.durakWins, stats.tictactoeWins, stats.sudokuSolved, stats.mahjongCleared].filter((value) => value > 0).length;
}

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
	{
		id: "first_steps",
		chain: "solo_games",
		reward: 25,
		title: "First Steps",
		target: 1,
		howToUnlock: "Finish any solo game.",
		getCurrent: (_scores, stats) => stats.soloGamesFinished,
	},
	{
		id: "regular_player",
		chain: "solo_games",
		reward: 50,
		title: "Regular Player",
		target: 10,
		howToUnlock: "Finish 10 solo games.",
		getCurrent: (_scores, stats) => stats.soloGamesFinished,
	},
	{
		id: "marathoner",
		chain: "solo_games",
		reward: 100,
		title: "Marathoner",
		target: 50,
		howToUnlock: "Finish 50 solo games.",
		getCurrent: (_scores, stats) => stats.soloGamesFinished,
	},
	{
		id: "score_hunter",
		chain: "solo_best",
		reward: 50,
		title: "Score Hunter",
		target: 1000,
		howToUnlock: "Reach 1000 points in one solo game.",
		getCurrent: (scores) => getBestScore(scores),
	},
	{
		id: "block_master",
		chain: "solo_best",
		reward: 150,
		title: "Block Master",
		target: 5000,
		howToUnlock: "Reach 5000 points in one solo game.",
		getCurrent: (scores) => getBestScore(scores),
	},
	{
		id: "score_legend",
		chain: "solo_best",
		reward: 300,
		title: "Score Legend",
		target: 10000,
		howToUnlock: "Reach 10000 points in one solo game.",
		getCurrent: (scores) => getBestScore(scores),
	},
	{
		id: "line_breaker",
		chain: "lines",
		reward: 25,
		title: "Line Breaker",
		target: 50,
		howToUnlock: "Clear 50 rows or columns.",
		getCurrent: (_scores, stats) => stats.totalLinesCleared,
	},
	{
		id: "line_crusher",
		chain: "lines",
		reward: 75,
		title: "Line Crusher",
		target: 250,
		howToUnlock: "Clear 250 rows or columns.",
		getCurrent: (_scores, stats) => stats.totalLinesCleared,
	},
	{
		id: "steady_hands",
		chain: "pieces",
		reward: 25,
		title: "Steady Hands",
		target: 200,
		howToUnlock: "Place 200 pieces.",
		getCurrent: (_scores, stats) => stats.totalPiecesPlaced,
	},
	{
		id: "piece_architect",
		chain: "pieces",
		reward: 75,
		title: "Piece Architect",
		target: 1000,
		howToUnlock: "Place 1000 pieces.",
		getCurrent: (_scores, stats) => stats.totalPiecesPlaced,
	},
	{
		id: "comeback",
		chain: "second_chance",
		reward: 20,
		title: "Comeback",
		target: 1,
		howToUnlock: "Use an extra chance once.",
		getCurrent: (_scores, stats) => stats.secondChancesUsed,
	},
	{
		id: "second_wind",
		chain: "second_chance",
		reward: 50,
		title: "Second Wind",
		target: 5,
		howToUnlock: "Use 5 extra chances.",
		getCurrent: (_scores, stats) => stats.secondChancesUsed,
	},
	{
		id: "classic_riser",
		chain: "classic",
		reward: 75,
		title: "Classic Riser",
		target: 2500,
		howToUnlock: "Reach 2500 points in Classic.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.Classic),
	},
	{
		id: "chaos_tamer",
		chain: "chaos",
		reward: 75,
		title: "Chaos Tamer",
		target: 1500,
		howToUnlock: "Reach 1500 points in Chaos.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.Chaos),
	},
	{
		id: "chaos_champion",
		chain: "chaos",
		reward: 250,
		title: "Chaos Champion",
		target: 5000,
		howToUnlock: "Reach 5000 points in Chaos.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.Chaos),
	},
	{
		id: "speed_spark",
		chain: "speed",
		reward: 50,
		title: "Speed Spark",
		target: 1000,
		howToUnlock: "Reach 1000 points in Speed mode.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.TimeAttack),
	},
	{
		id: "speed_streak",
		chain: "speed",
		reward: 100,
		title: "Speed Streak",
		target: 2500,
		howToUnlock: "Reach 2500 points in Speed mode.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.TimeAttack),
	},
	{
		id: "daily_solver",
		chain: "daily_puzzle",
		reward: 50,
		title: "Daily Solver",
		target: 1000,
		howToUnlock: "Reach 1000 points in Daily Puzzle.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.DailyPuzzle),
	},
	{
		id: "move_planner",
		chain: "move_limit",
		reward: 50,
		title: "Move Planner",
		target: 1000,
		howToUnlock: "Reach 1000 points in Move Limit.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.MoveLimit),
	},
	{
		id: "mode_sampler",
		chain: "modes",
		reward: 150,
		title: "Mode Sampler",
		target: LEADERBOARD_GAME_MODES.length,
		howToUnlock: "Score in every solo mode.",
		getCurrent: (scores) => getModeSamplerProgress(scores),
	},
	{
		id: "score_collector",
		chain: "score_total",
		reward: 100,
		title: "Score Collector",
		target: 5000,
		howToUnlock: "Build a 5000-point best-score total across modes.",
		getCurrent: (scores) => getBestScoreTotal(scores),
	},
	{
		id: "solo_grinder",
		chain: "solo_games",
		reward: 200,
		title: "Solo Grinder",
		target: 100,
		howToUnlock: "Finish 100 solo games.",
		getCurrent: (_scores, stats) => stats.soloGamesFinished,
	},
	{
		id: "solo_veteran",
		chain: "solo_games",
		reward: 400,
		title: "Solo Veteran",
		target: 250,
		howToUnlock: "Finish 250 solo games.",
		getCurrent: (_scores, stats) => stats.soloGamesFinished,
	},
	{
		id: "line_engineer",
		chain: "lines",
		reward: 150,
		title: "Line Engineer",
		target: 500,
		howToUnlock: "Clear 500 rows or columns.",
		getCurrent: (_scores, stats) => stats.totalLinesCleared,
	},
	{
		id: "line_tycoon",
		chain: "lines",
		reward: 300,
		title: "Line Tycoon",
		target: 1000,
		howToUnlock: "Clear 1000 rows or columns.",
		getCurrent: (_scores, stats) => stats.totalLinesCleared,
	},
	{
		id: "line_myth",
		chain: "lines",
		reward: 750,
		title: "Line Myth",
		target: 2500,
		howToUnlock: "Clear 2500 rows or columns.",
		getCurrent: (_scores, stats) => stats.totalLinesCleared,
	},
	{
		id: "piece_builder",
		chain: "pieces",
		reward: 150,
		title: "Piece Builder",
		target: 2500,
		howToUnlock: "Place 2500 pieces.",
		getCurrent: (_scores, stats) => stats.totalPiecesPlaced,
	},
	{
		id: "piece_factory",
		chain: "pieces",
		reward: 300,
		title: "Piece Factory",
		target: 5000,
		howToUnlock: "Place 5000 pieces.",
		getCurrent: (_scores, stats) => stats.totalPiecesPlaced,
	},
	{
		id: "piece_city",
		chain: "pieces",
		reward: 600,
		title: "Piece City",
		target: 10000,
		howToUnlock: "Place 10000 pieces.",
		getCurrent: (_scores, stats) => stats.totalPiecesPlaced,
	},
	{
		id: "score_titan",
		chain: "solo_best",
		reward: 750,
		title: "Score Titan",
		target: 25000,
		howToUnlock: "Reach 25000 points in one solo game.",
		getCurrent: (scores) => getBestScore(scores),
	},
	{
		id: "score_myth",
		chain: "solo_best",
		reward: 2000,
		title: "Score Myth",
		target: 50000,
		howToUnlock: "Reach 50000 points in one solo game.",
		getCurrent: (scores) => getBestScore(scores),
	},
	{
		id: "classic_peak",
		chain: "classic",
		reward: 300,
		title: "Classic Peak",
		target: 10000,
		howToUnlock: "Reach 10000 points in Classic.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.Classic),
	},
	{
		id: "classic_orbit",
		chain: "classic",
		reward: 800,
		title: "Classic Orbit",
		target: 20000,
		howToUnlock: "Reach 20000 points in Classic.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.Classic),
	},
	{
		id: "chaos_overlord",
		chain: "chaos",
		reward: 600,
		title: "Chaos Overlord",
		target: 10000,
		howToUnlock: "Reach 10000 points in Chaos.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.Chaos),
	},
	{
		id: "speed_flash",
		chain: "speed",
		reward: 300,
		title: "Speed Flash",
		target: 5000,
		howToUnlock: "Reach 5000 points in Speed mode.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.TimeAttack),
	},
	{
		id: "speed_blazer",
		chain: "speed",
		reward: 600,
		title: "Speed Blazer",
		target: 7500,
		howToUnlock: "Reach 7500 points in Speed mode.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.TimeAttack),
	},
	{
		id: "daily_regular",
		chain: "daily_puzzle",
		reward: 150,
		title: "Daily Regular",
		target: 2500,
		howToUnlock: "Reach 2500 points in Daily Puzzle.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.DailyPuzzle),
	},
	{
		id: "daily_elite",
		chain: "daily_puzzle",
		reward: 400,
		title: "Daily Elite",
		target: 5000,
		howToUnlock: "Reach 5000 points in Daily Puzzle.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.DailyPuzzle),
	},
	{
		id: "move_tactician",
		chain: "move_limit",
		reward: 150,
		title: "Move Tactician",
		target: 2000,
		howToUnlock: "Reach 2000 points in Move Limit.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.MoveLimit),
	},
	{
		id: "move_mastermind",
		chain: "move_limit",
		reward: 400,
		title: "Move Mastermind",
		target: 4000,
		howToUnlock: "Reach 4000 points in Move Limit.",
		getCurrent: (scores) => getBestScoreForMode(scores, GameModeType.MoveLimit),
	},
	{
		id: "score_vault",
		chain: "score_total",
		reward: 300,
		title: "Score Vault",
		target: 15000,
		howToUnlock: "Build a 15000-point best-score total across modes.",
		getCurrent: (scores) => getBestScoreTotal(scores),
	},
	{
		id: "solo_legend",
		chain: "solo_games",
		reward: 1500,
		title: "Solo Legend",
		target: 1000,
		howToUnlock: "Finish 1000 solo games.",
		getCurrent: (_scores, stats) => stats.soloGamesFinished,
	},
	{
		id: "first_duel",
		chain: "versus_wins",
		reward: 50,
		title: "First Duel",
		target: 1,
		howToUnlock: "Win a Versus match.",
		getCurrent: (_scores, stats) => stats.versusWins,
	},
	{
		id: "duelist",
		chain: "versus_wins",
		reward: 150,
		title: "Duelist",
		target: 10,
		howToUnlock: "Win 10 Versus matches.",
		getCurrent: (_scores, stats) => stats.versusWins,
	},
	{
		id: "arena_veteran",
		chain: "versus_wins",
		reward: 500,
		title: "Arena Veteran",
		target: 50,
		howToUnlock: "Win 50 Versus matches.",
		getCurrent: (_scores, stats) => stats.versusWins,
	},
	{
		id: "arena_legend",
		chain: "versus_wins",
		reward: 1500,
		title: "Arena Legend",
		target: 200,
		howToUnlock: "Win 200 Versus matches.",
		getCurrent: (_scores, stats) => stats.versusWins,
	},
	{
		id: "sparring_partner",
		chain: "versus_played",
		reward: 50,
		title: "Sparring Partner",
		target: 10,
		howToUnlock: "Play 10 Versus matches.",
		getCurrent: (_scores, stats) => stats.versusPlayed,
	},
	{
		id: "regular_rival",
		chain: "versus_played",
		reward: 150,
		title: "Regular Rival",
		target: 50,
		howToUnlock: "Play 50 Versus matches.",
		getCurrent: (_scores, stats) => stats.versusPlayed,
	},
	{
		id: "pawn_pusher",
		chain: "chess_wins",
		reward: 50,
		title: "Pawn Pusher",
		target: 1,
		howToUnlock: "Win a chess game.",
		getCurrent: (_scores, stats) => stats.chessWins,
	},
	{
		id: "knight_rider",
		chain: "chess_wins",
		reward: 200,
		title: "Knight Rider",
		target: 10,
		howToUnlock: "Win 10 chess games.",
		getCurrent: (_scores, stats) => stats.chessWins,
	},
	{
		id: "chess_master",
		chain: "chess_wins",
		reward: 750,
		title: "Chess Master",
		target: 50,
		howToUnlock: "Win 50 chess games.",
		getCurrent: (_scores, stats) => stats.chessWins,
	},
	{
		id: "deckhand",
		chain: "sea_wins",
		reward: 50,
		title: "Deckhand",
		target: 1,
		howToUnlock: "Win a Sea Battle.",
		getCurrent: (_scores, stats) => stats.seaWins,
	},
	{
		id: "sea_captain",
		chain: "sea_wins",
		reward: 200,
		title: "Captain",
		target: 10,
		howToUnlock: "Win 10 Sea Battles.",
		getCurrent: (_scores, stats) => stats.seaWins,
	},
	{
		id: "admiral",
		chain: "sea_wins",
		reward: 750,
		title: "Admiral",
		target: 50,
		howToUnlock: "Win 50 Sea Battles.",
		getCurrent: (_scores, stats) => stats.seaWins,
	},
	{
		id: "card_rookie",
		chain: "durak_wins",
		reward: 50,
		title: "Card Rookie",
		target: 1,
		howToUnlock: "Win a Durak game.",
		getCurrent: (_scores, stats) => stats.durakWins,
	},
	{
		id: "card_shark",
		chain: "durak_wins",
		reward: 200,
		title: "Card Shark",
		target: 10,
		howToUnlock: "Win 10 Durak games.",
		getCurrent: (_scores, stats) => stats.durakWins,
	},
	{
		id: "never_the_fool",
		chain: "durak_wins",
		reward: 750,
		title: "Never the Fool",
		target: 50,
		howToUnlock: "Win 50 Durak games.",
		getCurrent: (_scores, stats) => stats.durakWins,
	},
	{
		id: "crosses_and_noughts",
		chain: "tictactoe_wins",
		reward: 50,
		title: "Crosses and Noughts",
		target: 1,
		howToUnlock: "Win a Tic-Tac-Toe game.",
		getCurrent: (_scores, stats) => stats.tictactoeWins,
	},
	{
		id: "three_in_a_row",
		chain: "tictactoe_wins",
		reward: 150,
		title: "Three in a Row",
		target: 10,
		howToUnlock: "Win 10 Tic-Tac-Toe games.",
		getCurrent: (_scores, stats) => stats.tictactoeWins,
	},
	{
		id: "tic_tac_pro",
		chain: "tictactoe_wins",
		reward: 500,
		title: "Tic-Tac Pro",
		target: 50,
		howToUnlock: "Win 50 Tic-Tac-Toe games.",
		getCurrent: (_scores, stats) => stats.tictactoeWins,
	},
	{
		id: "number_novice",
		chain: "sudoku_solved",
		reward: 50,
		title: "Number Novice",
		target: 1,
		howToUnlock: "Solve a Sudoku.",
		getCurrent: (_scores, stats) => stats.sudokuSolved,
	},
	{
		id: "number_cruncher",
		chain: "sudoku_solved",
		reward: 200,
		title: "Number Cruncher",
		target: 10,
		howToUnlock: "Solve 10 Sudokus.",
		getCurrent: (_scores, stats) => stats.sudokuSolved,
	},
	{
		id: "sudoku_sage",
		chain: "sudoku_solved",
		reward: 750,
		title: "Sudoku Sage",
		target: 50,
		howToUnlock: "Solve 50 Sudokus.",
		getCurrent: (_scores, stats) => stats.sudokuSolved,
	},
	{
		id: "tile_turner",
		chain: "mahjong_cleared",
		reward: 50,
		title: "Tile Turner",
		target: 1,
		howToUnlock: "Clear a Mahjong board.",
		getCurrent: (_scores, stats) => stats.mahjongCleared,
	},
	{
		id: "tile_master",
		chain: "mahjong_cleared",
		reward: 200,
		title: "Tile Master",
		target: 10,
		howToUnlock: "Clear 10 Mahjong boards.",
		getCurrent: (_scores, stats) => stats.mahjongCleared,
	},
	{
		id: "mahjong_sage",
		chain: "mahjong_cleared",
		reward: 750,
		title: "Mahjong Sage",
		target: 50,
		howToUnlock: "Clear 50 Mahjong boards.",
		getCurrent: (_scores, stats) => stats.mahjongCleared,
	},
	{
		id: "sparring_bot",
		chain: "bot_wins",
		reward: 25,
		title: "Sparring Bot",
		target: 1,
		howToUnlock: "Beat the bot once.",
		getCurrent: (_scores, stats) => stats.botWins,
	},
	{
		id: "bot_basher",
		chain: "bot_wins",
		reward: 100,
		title: "Bot Basher",
		target: 10,
		howToUnlock: "Beat the bot 10 times.",
		getCurrent: (_scores, stats) => stats.botWins,
	},
	{
		id: "bot_buster",
		chain: "bot_wins",
		reward: 400,
		title: "Bot Buster",
		target: 50,
		howToUnlock: "Beat the bot 50 times.",
		getCurrent: (_scores, stats) => stats.botWins,
	},
	{
		id: "tough_nut",
		chain: "bot_hard",
		reward: 100,
		title: "Tough Nut",
		target: 1,
		howToUnlock: "Beat the bot on Hard.",
		getCurrent: (_scores, stats) => stats.botHardWins,
	},
	{
		id: "machine_breaker",
		chain: "bot_hard",
		reward: 300,
		title: "Machine Breaker",
		target: 10,
		howToUnlock: "Beat the bot on Hard 10 times.",
		getCurrent: (_scores, stats) => stats.botHardWins,
	},
	{
		id: "terminator",
		chain: "bot_hard",
		reward: 800,
		title: "Terminator",
		target: 25,
		howToUnlock: "Beat the bot on Hard 25 times.",
		getCurrent: (_scores, stats) => stats.botHardWins,
	},
	{
		id: "game_hopper",
		chain: "game_hopper",
		reward: 100,
		title: "Game Hopper",
		target: 2,
		howToUnlock: "Win in 2 different games.",
		getCurrent: (_scores, stats) => getGameHopperProgress(stats),
	},
	{
		id: "all_rounder",
		chain: "game_hopper",
		reward: 300,
		title: "All-Rounder",
		target: 4,
		howToUnlock: "Win in 4 different games.",
		getCurrent: (_scores, stats) => getGameHopperProgress(stats),
	},
	{
		id: "jack_of_all_games",
		chain: "game_hopper",
		reward: 1000,
		title: "Jack of All Games",
		target: 7,
		howToUnlock: "Win in all 7 games: Versus, Chess, Sea Battle, Durak, Tic-Tac-Toe, Sudoku and Mahjong.",
		getCurrent: (_scores, stats) => getGameHopperProgress(stats),
	},
	{
		id: "piggy_bank",
		chain: "coins_held",
		reward: 100,
		title: "Piggy Bank",
		target: 1000,
		howToUnlock: "Collect 1000 coins.",
		getCurrent: (_scores, stats) => stats.peakCoins,
	},
	{
		id: "coin_stack",
		chain: "coins_held",
		reward: 250,
		title: "Coin Stack",
		target: 5000,
		howToUnlock: "Collect 5000 coins.",
		getCurrent: (_scores, stats) => stats.peakCoins,
	},
	{
		id: "treasure_chest",
		chain: "coins_held",
		reward: 750,
		title: "Treasure Chest",
		target: 25000,
		howToUnlock: "Collect 25000 coins.",
		getCurrent: (_scores, stats) => stats.peakCoins,
	},
	{
		id: "tycoon",
		chain: "coins_held",
		reward: 2500,
		title: "Tycoon",
		target: 100000,
		howToUnlock: "Collect 100000 coins.",
		getCurrent: (_scores, stats) => stats.peakCoins,
	},
	{
		id: "royal_mint",
		chain: "coins_held",
		reward: 10000,
		title: "Royal Mint",
		target: 500000,
		howToUnlock: "Collect 500000 coins.",
		getCurrent: (_scores, stats) => stats.peakCoins,
	},
	{
		id: "good_habit",
		chain: "streak",
		reward: 50,
		title: "Good Habit",
		target: 3,
		howToUnlock: "Log in 3 days in a row.",
		getCurrent: (_scores, stats) => stats.streakBest,
	},
	{
		id: "week_warrior",
		chain: "streak",
		reward: 100,
		title: "Week Warrior",
		target: 7,
		howToUnlock: "Log in 7 days in a row.",
		getCurrent: (_scores, stats) => stats.streakBest,
	},
	{
		id: "fortnight_fighter",
		chain: "streak",
		reward: 250,
		title: "Fortnight Fighter",
		target: 14,
		howToUnlock: "Log in 14 days in a row.",
		getCurrent: (_scores, stats) => stats.streakBest,
	},
	{
		id: "monthly_devotion",
		chain: "streak",
		reward: 600,
		title: "Monthly Devotion",
		target: 30,
		howToUnlock: "Log in 30 days in a row.",
		getCurrent: (_scores, stats) => stats.streakBest,
	},
	{
		id: "centurion",
		chain: "streak",
		reward: 2500,
		title: "Centurion",
		target: 100,
		howToUnlock: "Log in 100 days in a row.",
		getCurrent: (_scores, stats) => stats.streakBest,
	},
];

/** Which tab of the achievements screen a chain belongs to. */
export const ACHIEVEMENT_CHAIN_GROUPS: Record<string, AchievementGroup> = {
	solo_games: "solo",
	solo_best: "solo",
	lines: "solo",
	pieces: "solo",
	second_chance: "solo",
	classic: "solo",
	chaos: "solo",
	speed: "solo",
	daily_puzzle: "solo",
	move_limit: "solo",
	modes: "solo",
	score_total: "solo",
	versus_wins: "versus",
	versus_played: "versus",
	chess_wins: "games",
	sea_wins: "games",
	durak_wins: "games",
	tictactoe_wins: "games",
	sudoku_solved: "games",
	mahjong_cleared: "games",
	bot_wins: "games",
	bot_hard: "games",
	game_hopper: "games",
	coins_held: "economy",
	streak: "economy",
};

const ACHIEVEMENT_UNLOCKED_KEY = "ACHIEVEMENTS_UNLOCKED";
const ACHIEVEMENT_UNLOCK_CHECK_DELAY_MS = 1200;

const achievementProgressListeners = new Set<() => void>();
const achievementUnlockListeners = new Set<(achievementIds: string[]) => void>();
let achievementUnlockTimer: ReturnType<typeof setTimeout> | null = null;
let achievementUnlockQueue: Promise<void> = Promise.resolve();

/** Called whenever stored achievement stats change (e.g. after a piece is placed). */
export function subscribeToAchievementProgress(listener: () => void): () => void {
	achievementProgressListeners.add(listener);
	return () => {
		achievementProgressListeners.delete(listener);
	};
}

/** Called with the ids of achievements that were just completed. */
export function subscribeToAchievementUnlocks(listener: (achievementIds: string[]) => void): () => void {
	achievementUnlockListeners.add(listener);
	return () => {
		achievementUnlockListeners.delete(listener);
	};
}

function notifyAchievementProgress() {
	achievementProgressListeners.forEach((listener) => {
		try {
			listener();
		} catch (error) {
			console.error("Achievement progress listener failed:", error);
		}
	});
}

/**
 * Pure helper. With no stored list yet (first run after this feature shipped)
 * everything already completed is treated as unlocked silently, so existing
 * players are not flooded with popups.
 */
export function computeNewAchievementUnlocks(
	rows: Pick<AchievementRow, "id" | "progress">[],
	storedUnlockedIds: string[] | null
): { newlyUnlocked: string[]; nextUnlocked: string[] } {
	const completeIds = rows.filter((row) => row.progress.complete).map((row) => row.id);
	if (storedUnlockedIds === null) {
		return { newlyUnlocked: [], nextUnlocked: completeIds };
	}

	const known = new Set(storedUnlockedIds);
	const newlyUnlocked = completeIds.filter((id) => !known.has(id));
	return { newlyUnlocked, nextUnlocked: [...storedUnlockedIds, ...newlyUnlocked] };
}

async function readUnlockedAchievementIds(): Promise<string[] | null> {
	try {
		const value = await AsyncStorage.getItem(ACHIEVEMENT_UNLOCKED_KEY);
		if (!value) return null;
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : null;
	} catch (error) {
		console.error("Error loading unlocked achievements:", error);
		return null;
	}
}

/** Finds achievements completed since the last check, remembers them and announces them once. */
export function checkAchievementUnlocks(): Promise<string[]> {
	const result = achievementUnlockQueue.catch(() => undefined).then(async () => {
		const [rows, stored] = await Promise.all([getAchievementRows(), readUnlockedAchievementIds()]);
		const { newlyUnlocked, nextUnlocked } = computeNewAchievementUnlocks(rows, stored);

		if (stored === null || newlyUnlocked.length > 0) {
			await AsyncStorage.setItem(ACHIEVEMENT_UNLOCKED_KEY, JSON.stringify(nextUnlocked));
		}

		if (newlyUnlocked.length > 0) {
			achievementUnlockListeners.forEach((listener) => {
				try {
					listener(newlyUnlocked);
				} catch (error) {
					console.error("Achievement unlock listener failed:", error);
				}
			});
		}

		return newlyUnlocked;
	});

	achievementUnlockQueue = result.then(() => undefined, () => undefined);
	return result;
}

function scheduleAchievementUnlockCheck() {
	if (achievementUnlockTimer) {
		clearTimeout(achievementUnlockTimer);
	}

	achievementUnlockTimer = setTimeout(() => {
		achievementUnlockTimer = null;
		void checkAchievementUnlocks().catch((error) => {
			console.error("Error checking achievement unlocks:", error);
		});
	}, ACHIEVEMENT_UNLOCK_CHECK_DELAY_MS);
}

export function getDefaultAchievementStats(): AchievementStats {
	return {
		soloGamesFinished: 0,
		totalLinesCleared: 0,
		totalPiecesPlaced: 0,
		secondChancesUsed: 0,
		versusWins: 0,
		versusPlayed: 0,
		chessWins: 0,
		seaWins: 0,
		durakWins: 0,
		tictactoeWins: 0,
		sudokuSolved: 0,
		mahjongCleared: 0,
		botWins: 0,
		botHardWins: 0,
		peakCoins: 0,
		streakBest: 0,
	};
}

function mergeAchievementProgress(base: AchievementStats, progress: Partial<AchievementStats>): AchievementStats {
	return {
		soloGamesFinished: base.soloGamesFinished + (progress.soloGamesFinished || 0),
		totalLinesCleared: base.totalLinesCleared + (progress.totalLinesCleared || 0),
		totalPiecesPlaced: base.totalPiecesPlaced + (progress.totalPiecesPlaced || 0),
		secondChancesUsed: base.secondChancesUsed + (progress.secondChancesUsed || 0),
		versusWins: base.versusWins + (progress.versusWins || 0),
		versusPlayed: base.versusPlayed + (progress.versusPlayed || 0),
		chessWins: base.chessWins + (progress.chessWins || 0),
		seaWins: base.seaWins + (progress.seaWins || 0),
		durakWins: base.durakWins + (progress.durakWins || 0),
		tictactoeWins: base.tictactoeWins + (progress.tictactoeWins || 0),
		sudokuSolved: base.sudokuSolved + (progress.sudokuSolved || 0),
		mahjongCleared: base.mahjongCleared + (progress.mahjongCleared || 0),
		botWins: base.botWins + (progress.botWins || 0),
		botHardWins: base.botHardWins + (progress.botHardWins || 0),
		// high-water marks keep the largest value instead of adding up
		peakCoins: Math.max(base.peakCoins, progress.peakCoins || 0),
		streakBest: Math.max(base.streakBest, progress.streakBest || 0),
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
		notifyAchievementProgress();
		scheduleAchievementUnlockCheck();
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
	feedDailyQuests(progress);
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

/** The same events also move today's daily quests along. */
function feedDailyQuests(progress: Partial<AchievementStats>): void {
	recordQuestProgress("lines", progress.totalLinesCleared ?? 0);
	recordQuestProgress("games", progress.soloGamesFinished ?? 0);
	recordQuestProgress("pieces", progress.totalPiecesPlaced ?? 0);
	recordQuestProgress("botWin", progress.botWins ?? 0);
	recordQuestProgress("versus", progress.versusPlayed ?? 0);
	const moreWins = (progress.chessWins ?? 0) + (progress.seaWins ?? 0) + (progress.durakWins ?? 0) + (progress.tictactoeWins ?? 0) + (progress.sudokuSolved ?? 0) + (progress.mahjongCleared ?? 0);
	recordQuestProgress("moreWin", moreWins);
}

type WinStatField = "chessWins" | "seaWins" | "durakWins" | "tictactoeWins" | "sudokuSolved" | "mahjongCleared";
const WIN_STAT_BY_GAME: Record<string, WinStatField> = {
	chess: "chessWins",
	battleship: "seaWins",
	durak: "durakWins",
	tictactoe: "tictactoeWins",
	sudoku: "sudokuSolved",
	mahjong: "mahjongCleared",
};

/** A finished win in one of the More Games. `vsBot` wins also count towards the "beat the computer" chains. */
export function recordMoreGameWin(gameId: string, options: { vsBot?: boolean; difficulty?: string } = {}): void {
	const field = WIN_STAT_BY_GAME[gameId];
	if (!field) return;
	recordGameOutcome(gameId, "win", { vsBot: options.vsBot });
	const progress: Partial<AchievementStats> = { [field]: 1 };
	if (options.vsBot) {
		progress.botWins = 1;
		if (options.difficulty === "hard") progress.botHardWins = 1;
	}
	void recordAchievementProgress(progress);
}

/** A finished Versus match (the player took part in it); `won` adds a win. */
export function recordVersusMatch(won: boolean): void {
	recordGameOutcome("versus", won ? "win" : "loss");
	void recordAchievementProgress({ versusPlayed: 1, versusWins: won ? 1 : 0 });
}

let notedPeakCoins = 0;
/** Remembers the highest coin balance ever seen; cheap to call on every balance change. */
export function noteCoinBalance(balance: number): void {
	if (!Number.isFinite(balance) || balance <= notedPeakCoins) return;
	notedPeakCoins = balance;
	void recordAchievementProgress({ peakCoins: balance });
}

let notedStreakBest = 0;
/** Remembers the longest daily streak the server has reported. */
export function noteStreakBest(best: number): void {
	if (!Number.isFinite(best) || best <= notedStreakBest) return;
	notedStreakBest = best;
	void recordAchievementProgress({ streakBest: best });
}

export async function getAchievementRows(): Promise<AchievementRow[]> {
	const stats = await getAchievementStats();
	const scoreGroups = await Promise.all(
		LEADERBOARD_GAME_MODES.map((mode) => getHighScores(mode, true, true))
	);

	return buildAchievementRows(scoreGroups.flat(), stats);
}
