import AsyncStorage from "@react-native-async-storage/async-storage";
import { atom, getDefaultStore, useAtomValue } from "jotai";
import { useCallback, useEffect } from "react";
import { useReducedMotion } from "react-native-reanimated";

// One comfort setting, kept on the device only: switch the block-break animations off.
// "auto" (never touched) follows the system "remove animations" setting.

export type MotionPreference = "auto" | "reduced" | "full";

export const ACCESSIBILITY_KEY = "ACCESSIBILITY_V1";

export const motionPreferenceAtom = atom<MotionPreference>("auto");

export function parseMotionPreference(raw: unknown): MotionPreference {
	if (!raw || typeof raw !== "object") return "auto";
	const motion = (raw as Record<string, unknown>).motion;
	return motion === "reduced" || motion === "full" ? motion : "auto";
}

export function shouldReduceMotion(motion: MotionPreference, systemReduced: boolean): boolean {
	if (motion === "reduced") return true;
	if (motion === "full") return false;
	return systemReduced;
}

let loadPromise: Promise<void> | null = null;
export function loadMotionPreference(): Promise<void> {
	if (!loadPromise) {
		loadPromise = AsyncStorage.getItem(ACCESSIBILITY_KEY)
			.then((raw) => {
				if (raw) getDefaultStore().set(motionPreferenceAtom, parseMotionPreference(JSON.parse(raw)));
			})
			.catch(() => undefined);
	}
	return loadPromise;
}

export function useReduceMotion(): boolean {
	const preference = useAtomValue(motionPreferenceAtom);
	const system = useReducedMotion();
	useEffect(() => {
		void loadMotionPreference();
	}, []);
	return shouldReduceMotion(preference, system);
}

/** The settings switch: on = animations off. Saves the explicit choice. */
export function useMotionSwitch() {
	const reduced = useReduceMotion();
	const setReduced = useCallback(async (value: boolean) => {
		const motion: MotionPreference = value ? "reduced" : "full";
		getDefaultStore().set(motionPreferenceAtom, motion);
		try {
			await AsyncStorage.setItem(ACCESSIBILITY_KEY, JSON.stringify({ motion }));
		} catch {
			// the choice still applies until the app closes
		}
	}, []);
	return { reduced, setReduced };
}
