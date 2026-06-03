import { GameModeType } from "@/hooks/useAppState";

export function shouldCheckConnectionBeforeStart(_mode: GameModeType): boolean {
	return false;
}
