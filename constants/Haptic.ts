import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { createPersistedSetting, parseBoolean, parseIntIn } from "./PersistedSetting";

// Every vibration of the game goes through buzz(), so the Options screen can switch it off or scale it.

export type Buzz = "light" | "medium" | "heavy" | "success" | "warning" | "error";

/** 0 gentle, 1 as designed (the default), 2 strong. */
export const HAPTIC_LEVELS = 3;

export const hapticEnabledSetting = createPersistedSetting<boolean>("HAPTICS_ENABLED", true, parseBoolean);
export const hapticLevelSetting = createPersistedSetting<number>("HAPTICS_LEVEL", 1, parseIntIn(0, HAPTIC_LEVELS - 1));

/** The impact strength a kind gets at an intensity level. */
export function impactFor(kind: "light" | "medium" | "heavy", level: number): "light" | "medium" | "heavy" {
	if (level <= 0) return "light";
	if (level >= 2) return kind === "light" ? "medium" : "heavy";
	return kind;
}

/** A short vibration; nothing on the web or when vibration is off. */
export function buzz(kind: Buzz): void {
	if (Platform.OS === "web" || !hapticEnabledSetting.get()) return;
	void hapticEnabledSetting.load();
	void hapticLevelSetting.load();
	const level = hapticLevelSetting.get();
	try {
		const styles = { light: Haptics.ImpactFeedbackStyle?.Light, medium: Haptics.ImpactFeedbackStyle?.Medium, heavy: Haptics.ImpactFeedbackStyle?.Heavy };
		const types = { success: Haptics.NotificationFeedbackType?.Success, warning: Haptics.NotificationFeedbackType?.Warning, error: Haptics.NotificationFeedbackType?.Error };
		const notification = kind === "success" || kind === "warning" || kind === "error";
		// the gentlest level turns every vibration into a light tap
		const run = notification && level > 0 ? Haptics.notificationAsync(types[kind]) : Haptics.impactAsync(styles[impactFor(notification ? "light" : (kind as "light" | "medium" | "heavy"), level)]);
		void Promise.resolve(run).catch(() => undefined);
	} catch {
		// vibration is optional
	}
}

export function useHapticSettings() {
	const enabled = hapticEnabledSetting.use();
	const level = hapticLevelSetting.use();
	return { enabled, level, setEnabled: hapticEnabledSetting.set, setLevel: hapticLevelSetting.set };
}
