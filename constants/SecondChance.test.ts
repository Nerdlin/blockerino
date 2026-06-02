import {
	SECOND_CHANCE_COSTS,
	SECOND_CHANCE_DECISION_SECONDS,
	applySecondChancePenalty,
	canUseSecondChance,
	getSecondChanceCost,
} from "./SecondChance";

describe("second chance helpers", () => {
	it("uses three escalating penalties", () => {
		expect(SECOND_CHANCE_DECISION_SECONDS).toBe(10);
		expect(SECOND_CHANCE_COSTS).toEqual([100, 500, 1000]);
		expect(getSecondChanceCost(0)).toBe(100);
		expect(getSecondChanceCost(1)).toBe(500);
		expect(getSecondChanceCost(2)).toBe(1000);
	});

	it("allows exactly three second chances", () => {
		expect(canUseSecondChance(0)).toBe(true);
		expect(canUseSecondChance(2)).toBe(true);
		expect(canUseSecondChance(3)).toBe(false);
	});

	it("never makes the current score negative", () => {
		expect(applySecondChancePenalty(1200, 2)).toBe(200);
		expect(applySecondChancePenalty(50, 0)).toBe(0);
	});
});
