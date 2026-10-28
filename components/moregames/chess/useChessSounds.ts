import { useEffect, useRef } from "react";
import { useSoundSettings } from "@/constants/Sound";
import { Color, remainingMs } from "@/constants/chess/ChessClock";
import { ChessGameState } from "@/constants/chess/ChessGameState";
import { lowTimeTick, moveSoundFor, resultSoundFor } from "@/constants/chess/ChessSounds";

/**
 * Plays the chess sounds for a game as its state changes: a start chime for every new game, a knock for each move
 * (capture, check, castle and promotion sound different), the result jingle, and a tick each second while the
 * player's own clock is under ten seconds.
 */
export function useChessSounds(state: ChessGameState | null, myColor: Color, now: number): void {
	const { playSfx } = useSoundSettings();
	const play = useRef(playSfx);
	play.current = playSfx;
	const lastPlies = useRef(0);
	const lastTick = useRef<number | null>(null);
	const startedAt = state?.startedAt;
	const plies = state?.history.length ?? 0;
	const winner = state?.result ? state.result.winner : undefined;
	const lastMove = plies > 0 ? state?.history[plies - 1] : undefined;

	// a new game
	useEffect(() => {
		if (startedAt === undefined) return;
		lastPlies.current = 0;
		lastTick.current = null;
		void play.current("chessStart");
	}, [startedAt]);

	// a move was played (stepping back by undo makes no sound)
	useEffect(() => {
		if (plies > lastPlies.current && lastMove) void play.current(moveSoundFor(lastMove));
		lastPlies.current = plies;
	}, [plies, lastMove]);

	// the game ended
	useEffect(() => {
		if (winner === undefined) return;
		const sound = resultSoundFor(winner, myColor);
		if (sound) void play.current(sound);
	}, [winner, myColor]);

	// the player's clock under ten seconds
	useEffect(() => {
		if (!state?.clock || !state.clock.running || state.result || state.clock.turn !== myColor) {
			lastTick.current = null;
			return;
		}
		const left = remainingMs(state.clock, now);
		const tick = lowTimeTick(myColor === "w" ? left.whiteMs : left.blackMs);
		if (tick !== null && tick !== lastTick.current) {
			lastTick.current = tick;
			void play.current("chessLowTime");
		}
	}, [now, state, myColor]);
}
