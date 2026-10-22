// Shared by every game that can be played against the computer.

export type BotDifficulty = "easy" | "medium" | "hard";

export const BOT_DIFFICULTIES: BotDifficulty[] = ["easy", "medium", "hard"];

/** Returns a number in [0, 1). Injected so tests (and replays) can make the bots deterministic. */
export type Rng = () => number;

export function randomInt(rng: Rng, maxExclusive: number): number {
	return Math.min(maxExclusive - 1, Math.floor(rng() * maxExclusive));
}

export function pickRandom<T>(rng: Rng, items: readonly T[]): T {
	return items[randomInt(rng, items.length)];
}

/** How often a bot of this level plays a deliberately careless move instead of its best one. */
export const BLUNDER_RATE: Record<BotDifficulty, number> = {
	easy: 0.55,
	medium: 0.2,
	hard: 0,
};

export function isBotDifficulty(value: unknown): value is BotDifficulty {
	return value === "easy" || value === "medium" || value === "hard";
}
