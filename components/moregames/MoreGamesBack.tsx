import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useEscapeKey } from "@/hooks/useEscapeKey";

// One back button per screen. The More Games header has the only "Back"; a screen inside a game (the chess bot list,
// puzzles, a game review) claims it here, so the header steps back one level instead of leaving the game, and the
// screen needs no back button of its own. The Android back key and Escape follow the same handler.

type Handler = () => void;
type Stack = { current: { handler: { current: Handler } }[] };

const BackStackContext = createContext<Stack | null>(null);

export function MoreGamesBackProvider({ stack, children }: { stack: Stack; children: ReactNode }) {
	return <BackStackContext.Provider value={stack}>{children}</BackStackContext.Provider>;
}

/** Runs the innermost claimed back step; false when nothing inside the game claimed it. */
export function runClaimedBack(stack: Stack): boolean {
	const top = stack.current[stack.current.length - 1];
	if (!top) return false;
	top.handler.current();
	return true;
}

/** While `enabled`, the header back button (and the Android back key) runs `handler` instead of leaving the game. */
export function useMoreGamesBack(handler: Handler, enabled: boolean = true) {
	const stack = useContext(BackStackContext);
	const handlerRef = useRef(handler);
	handlerRef.current = handler;
	useEscapeKey(() => handlerRef.current(), enabled);
	useEffect(() => {
		if (!stack || !enabled) return;
		const entry = { handler: handlerRef };
		stack.current.push(entry);
		return () => {
			const index = stack.current.indexOf(entry);
			if (index >= 0) stack.current.splice(index, 1);
		};
	}, [stack, enabled]);
}
