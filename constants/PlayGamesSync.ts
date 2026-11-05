import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isPlayGamesSignedIn, submitPlayGamesScore, unlockPlayGamesAchievement } from "@/modules/play-games";
import { subscribeToAchievementUnlocks } from "./Achievements";

// Mirrors the game's own achievements and Classic/Chaos bests to Google Play Games. The game's achievements stay the
// source of truth; Play Games only gets the subset set up in Play Console (see docs/play-games-achievements.md).
// Play signs the player in by itself at start; when it did not, nothing is sent.

/** Our achievement id -> the Play Games achievement id ("CgkI..."), from Play Console once they are created. */
export const PLAY_GAMES_ACHIEVEMENTS: Record<string, string> = {
	first_steps: "CgkI_-O2-tADEAIQCg",
	line_breaker: "CgkI_-O2-tADEAIQFg",
	piece_architect: "CgkI_-O2-tADEAIQEw",
	score_hunter: "CgkI_-O2-tADEAIQEQ",
	score_legend: "CgkI_-O2-tADEAIQEA",
	classic_riser: "CgkI_-O2-tADEAIQDQ",
	chaos_tamer: "CgkI_-O2-tADEAIQFA",
	first_duel: "CgkI_-O2-tADEAIQBw",
	duelist: "CgkI_-O2-tADEAIQAw",
	pawn_pusher: "CgkI_-O2-tADEAIQDg",
	chess_master: "CgkI_-O2-tADEAIQFQ",
	card_rookie: "CgkI_-O2-tADEAIQCQ",
	deckhand: "CgkI_-O2-tADEAIQDw",
	sudoku_sage: "CgkI_-O2-tADEAIQEg",
	mahjong_sage: "CgkI_-O2-tADEAIQBQ",
	bot_basher: "CgkI_-O2-tADEAIQDA",
	terminator: "CgkI_-O2-tADEAIQCw",
	all_rounder: "CgkI_-O2-tADEAIQBA",
	week_warrior: "CgkI_-O2-tADEAIQBg",
	centurion: "CgkI_-O2-tADEAIQCA",
	// added in 2.0.7
	checkers_rookie: "CgkI_-O2-tADEAIQHQ",
	checkers_captain: "CgkI_-O2-tADEAIQGg",
	checkers_grandmaster: "CgkI_-O2-tADEAIQFw",
	daily_habit: "CgkI_-O2-tADEAIQIQ",
	daily_devotee: "CgkI_-O2-tADEAIQGw",
	daily_legend: "CgkI_-O2-tADEAIQGQ",
	star_gazer: "CgkI_-O2-tADEAIQHA",
	star_collector: "CgkI_-O2-tADEAIQIg",
	star_master: "CgkI_-O2-tADEAIQHw",
	rank_gold: "CgkI_-O2-tADEAIQGA",
	rank_diamond: "CgkI_-O2-tADEAIQIA",
	rank_legend: "CgkI_-O2-tADEAIQHg",
};

/** Game mode -> Play Games leaderboard id. */
export const PLAY_GAMES_LEADERBOARDS: Record<string, string> = {
	classic: "CgkI_-O2-tADEAIQAQ",
	chaos: "CgkI_-O2-tADEAIQAg",
};

const ACHIEVEMENT_UNLOCKED_KEY = "ACHIEVEMENTS_UNLOCKED";

let signedIn = false;

/** Achievement ids that have a Play Games counterpart, mapped to it. */
export function playGamesIdsFor(achievementIds: string[], mapping: Record<string, string> = PLAY_GAMES_ACHIEVEMENTS): string[] {
	return achievementIds.map((id) => mapping[id]).filter((id): id is string => Boolean(id));
}

async function unlockAlreadyEarned() {
	try {
		const raw = await AsyncStorage.getItem(ACHIEVEMENT_UNLOCKED_KEY);
		const ids = raw ? (JSON.parse(raw) as unknown) : [];
		if (Array.isArray(ids)) playGamesIdsFor(ids.filter((id): id is string => typeof id === "string")).forEach(unlockPlayGamesAchievement);
	} catch {
		// the next unlock sends its own achievement anyway
	}
}

/** Called once at app start on Android. */
export function startPlayGamesSync(): () => void {
	if (Platform.OS !== "android") return () => undefined;
	void isPlayGamesSignedIn().then((value) => {
		signedIn = value;
		// achievements earned before Play Games existed in the game (or on another phone) catch up on the first sign-in
		if (value) void unlockAlreadyEarned();
	});
	return subscribeToAchievementUnlocks((ids) => {
		if (signedIn) playGamesIdsFor(ids).forEach(unlockPlayGamesAchievement);
	});
}

/** A finished or saved score; Play Games keeps the best one itself. */
export function reportPlayGamesScore(gameMode: string, score: number): void {
	const leaderboard = PLAY_GAMES_LEADERBOARDS[gameMode];
	if (signedIn && leaderboard && score > 0) submitPlayGamesScore(leaderboard, score);
}
