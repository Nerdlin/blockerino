import { requireOptionalNativeModule } from "expo-modules-core";

// Google Play Games Services (Android). Absent on web, iOS, in tests and in builds before 2.0.5: every call is then a
// no-op and isAuthenticated() is false.
interface PlayGamesNative {
	isAuthenticated(): Promise<boolean>;
	signIn(): Promise<boolean>;
	unlockAchievement(id: string): void;
	setAchievementSteps(id: string, steps: number): void;
	submitScore(leaderboardId: string, score: number): void;
	showAchievements(): Promise<boolean>;
}

const PlayGames = requireOptionalNativeModule<PlayGamesNative>("PlayGames");

export const isPlayGamesAvailable = (): boolean => PlayGames !== null;

async function safely<T>(run: () => Promise<T>, fallback: T): Promise<T> {
	try {
		return PlayGames ? await run() : fallback;
	} catch {
		return fallback;
	}
}

export const isPlayGamesSignedIn = () => safely(() => PlayGames!.isAuthenticated(), false);
export const signInToPlayGames = () => safely(() => PlayGames!.signIn(), false);
export const showPlayGamesAchievements = () => safely(() => PlayGames!.showAchievements(), false);

export function unlockPlayGamesAchievement(id: string): void {
	try {
		PlayGames?.unlockAchievement(id);
	} catch {
		// Play Games is optional
	}
}

export function setPlayGamesAchievementSteps(id: string, steps: number): void {
	try {
		PlayGames?.setAchievementSteps(id, Math.floor(steps));
	} catch {
		// Play Games is optional
	}
}

export function submitPlayGamesScore(leaderboardId: string, score: number): void {
	try {
		PlayGames?.submitScore(leaderboardId, Math.floor(score));
	} catch {
		// Play Games is optional
	}
}
