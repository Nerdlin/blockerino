export const SECOND_CHANCE_COSTS = [100, 500, 1000] as const;
export const SECOND_CHANCE_DECISION_SECONDS = 10;
export const MAX_SECOND_CHANCES = 3;

export function canUseSecondChance(chancesUsed: number): boolean {
	return chancesUsed < MAX_SECOND_CHANCES && chancesUsed < SECOND_CHANCE_COSTS.length;
}

export function getSecondChanceCost(chancesUsed: number): number {
	return SECOND_CHANCE_COSTS[Math.min(chancesUsed, SECOND_CHANCE_COSTS.length - 1)];
}

export function applySecondChancePenalty(score: number, chancesUsed: number): number {
	return Math.max(0, score - getSecondChanceCost(chancesUsed));
}
