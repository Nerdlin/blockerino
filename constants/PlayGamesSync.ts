import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isPlayGamesSignedIn, submitPlayGamesScore, unlockPlayGamesAchievement } from "@/modules/play-games";
import { subscribeToAchievementUnlocks } from "./Achievements";

// Mirrors the game's own achievements and Classic/Chaos bests to Google Play Games. The game's achievements stay the
// source of truth; Play Games only gets the subset set up in Play Console (see docs/play-games-achievements.md).
// Play signs the player in by itself at start; when it did not, nothing is sent.

/** Our achievement id -> the Play Games achievement id ("CgkI..."), from Play Console once they are created. */
export const PLAY_GAMES_ACHIEVEMENTS: Record<string, string> = {};

/** Game mode -> Play Games leaderboard id. */
export const PLAY_GAMES_LEADERBOARDS: Record<string, string> = {};

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
