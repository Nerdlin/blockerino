import { useEffect, useRef } from "react";
import { useSoundSettings, type SoundType } from "@/constants/Sound";

// Sounds and vibration shared by the mini-games (Sea Battle, Checkers, Durak, Tic-Tac-Toe). Chess has its own hook.

import { buzz } from "@/constants/Haptic";
export { buzz, type Buzz } from "@/constants/Haptic";

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
