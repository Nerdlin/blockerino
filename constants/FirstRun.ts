import AsyncStorage from "@react-native-async-storage/async-storage";
import { atom } from "jotai";

// The very first launch skips the menu: it drops the player straight into Classic with a short hint that
// goes away with the first placed block. Anyone who has played before is not a new player, whatever the
// app version: finished games or a saved nickname mean "already seen it".

const DONE_KEY = "FIRST_RUN_DONE";
const EXISTING_PLAYER_KEYS = ["HIGH_SCORES", "PLAYER_NAME"];

/** True while the hint is on screen in the first game. */
export const firstRunCoachAtom = atom(false);

export async function shouldRunFirstRun(): Promise<boolean> {
	try {
		if (await AsyncStorage.getItem(DONE_KEY)) return false;
		for (const key of EXISTING_PLAYER_KEYS) {
			if (await AsyncStorage.getItem(key)) {
				await AsyncStorage.setItem(DONE_KEY, "true");
				return false;
			}
		}
		return true;
	} catch {
		// If storage is unreadable do not trap the player in a first-run flow.
		return false;
	}
}

export async function markFirstRunDone(): Promise<void> {
	try {
		await AsyncStorage.setItem(DONE_KEY, "true");
	} catch {
		// Worst case the hint shows once more.
	}
}
