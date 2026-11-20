import type { UiGlyphName } from "./UiGlyphs";

// Full-screen celebrations: a new medal, a new pass level, a streak saved by a freeze. Anything can call celebrate();
// the host (components/CelebrationHost.tsx) shows them one after another, never in the middle of a game.

export interface CelebrationEvent {
	/** The same id is shown once while it waits in the queue. */
	id: string;
	icon: UiGlyphName;
	accent: string;
	title: string;
	subtitle?: string;
	/** Coins that count up under the title. */
	coins?: number;
	/** Small extra lines under it, e.g. "+2 keys". */
	lines?: string[];
}

const listeners = new Set<(event: CelebrationEvent) => void>();

export function celebrate(event: CelebrationEvent): void {
	listeners.forEach((listener) => listener(event));
}

export function subscribeToCelebrations(listener: (event: CelebrationEvent) => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** The pass level the player was last celebrated for in this season (null the first time: nothing to celebrate yet). */
export function passTierKey(season: string): string {
	return `CELEBRATED_PASS_TIER:${season}`;
}

/** Levels reached since `seen`; only the newest is celebrated, so a jump of several levels is one screen. */
export function newPassTier(seen: number | null, tier: number): number | null {
	if (seen === null) return null;
	return tier > seen ? tier : null;
}
