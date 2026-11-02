import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { useSoundSettings, type SoundType } from "@/constants/Sound";

// Sounds and vibration shared by the mini-games (Sea Battle, Checkers, Durak, Tic-Tac-Toe). Chess has its own hook.

export type Buzz = "light" | "medium" | "heavy" | "success" | "warning" | "error";

/** A short vibration; nothing on the web. */
export function buzz(kind: Buzz): void {
	if (Platform.OS === "web") return;
	try {
		const run = kind === "success" || kind === "warning" || kind === "error"
			? Haptics.notificationAsync(kind === "success" ? Haptics.NotificationFeedbackType.Success : kind === "warning" ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Error)
			: Haptics.impactAsync(kind === "light" ? Haptics.ImpactFeedbackStyle.Light : kind === "medium" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy);
		void run.catch(() => undefined);
	} catch {
		// vibration is optional
	}
}

/** playSfx that stays stable between renders, for effects and timers. */
export function useGameSfx(): (sound: SoundType) => void {
	const { playSfx } = useSoundSettings();
	const play = useRef(playSfx);
	play.current = playSfx;
	return useRef((sound: SoundType) => void play.current(sound)).current;
}

export type GameOutcome = "win" | "loss" | "draw" | null;

/** The result jingle (the chess ones) once per finished game; `key` tells one finished game from the next. */
export function useOutcomeSound(outcome: GameOutcome, key: string): void {
	const play = useGameSfx();
	const played = useRef<string | null>(null);
	useEffect(() => {
		if (!outcome) {
			played.current = null;
			return;
		}
		const id = `${key}:${outcome}`;
		if (played.current === id) return;
		played.current = id;
		play(outcome === "win" ? "chessWin" : outcome === "loss" ? "chessLose" : "chessDraw");
		buzz(outcome === "win" ? "success" : outcome === "loss" ? "error" : "warning");
	}, [outcome, key, play]);
}
