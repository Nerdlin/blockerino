import { GameModeType } from "@/hooks/useAppState";
import { buildRunGoals, getCurrentGoal, getDifficulty, getMedalForScore, getNextMedal, hasRunGoals, isDangerFill } from "./RunGoals";
import { createRandomHand } from "./Hand";
import { isClassicComplexPiece, isClassicRescuePiece } from "./Piece";

describe("run goals", () => {
	it("gives medals at fixed scores in the endless modes only", () => {
		expect(hasRunGoals(GameModeType.Classic)).toBe(true);
		expect(hasRunGoals(GameModeType.Chaos)).toBe(true);
		expect(hasRunGoals(GameModeType.Rescue)).toBe(false);
		expect(getMedalForScore(GameModeType.Classic, 499)).toBeNull();
		expect(getMedalForScore(GameModeType.Classic, 500)?.id).toBe("bronze");
		expect(getMedalForScore(GameModeType.Classic, 7000)?.id).toBe("gold");
		expect(getNextMedal(GameModeType.Classic, 1800)?.id).toBe("silver");
		expect(getNextMedal(GameModeType.Classic, 6000)).toBeNull();
	});

	it("orders medals, the record and friends, and a record must be beaten, not matched", () => {
		const goals = buildRunGoals(GameModeType.Classic, 800, [{ name: "Ann", score: 1500 }, { name: "Low", score: 200 }]);
		expect(goals.map((goal) => `${goal.kind}:${goal.score}`)).toEqual(["bronze:500", "record:801", "friend:1501", "silver:2000", "gold:6000"]);
		expect(getCurrentGoal(goals, 0)).toMatchObject({ goal: { kind: "bronze" }, from: 0, index: 0 });
		expect(getCurrentGoal(goals, 800)).toMatchObject({ goal: { kind: "record" }, from: 500 });
		expect(getCurrentGoal(goals, 801)).toMatchObject({ goal: { kind: "friend", name: "Ann" } });
		expect(getCurrentGoal(goals, 6000)).toBeNull();
	});

	it("a first run has medals only", () => {
		expect(buildRunGoals(GameModeType.Chaos, 0).map((goal) => goal.kind)).toEqual(["bronze", "silver", "gold"]);
	});

	it("difficulty grows from 0 to 1 with the score, only in the endless modes", () => {
		expect(getDifficulty("classic", 0)).toBe(0);
		expect(getDifficulty("classic", 300)).toBe(0);
		expect(getDifficulty("classic", 3150)).toBeCloseTo(0.5);
		expect(getDifficulty("classic", 99999)).toBe(1);
		expect(getDifficulty("chaos", 15000)).toBe(1);
		expect(getDifficulty("rescue", 99999)).toBe(0);
		expect(getDifficulty(undefined, 99999)).toBe(0);
	});

	it("the board is in danger when mostly filled", () => {
		expect(isDangerFill(39, 64)).toBe(false);
		expect(isDangerFill(40, 64)).toBe(true);
	});
});

describe("hands get harder", () => {
	const sample = (difficulty: number) => {
		let rescue = 0, complex = 0, withRescue = 0;
		const hands = 3000;
		for (let i = 0; i < hands; i++) {
			const hand = createRandomHand(3, GameModeType.Classic, difficulty);
			if (hand.some((piece) => piece && isClassicRescuePiece(piece))) withRescue++;
			for (const piece of hand) {
				if (!piece) continue;
				if (isClassicRescuePiece(piece)) rescue++;
				if (isClassicComplexPiece(piece)) complex++;
			}
		}
		return { rescue: rescue / hands, complex: complex / hands, withRescue: withRescue / hands };
	};

	it("a young Classic run always has a rescue piece and no big pieces", () => {
		const easy = sample(0);
		expect(easy.withRescue).toBe(1);
		expect(easy.complex).toBe(0);
	});

	it("a long Classic run brings big pieces and fewer small ones, at most one big piece a hand", () => {
		const easy = sample(0);
		const hard = sample(1);
		expect(hard.complex).toBeGreaterThan(0.2); // about one big piece every 4 hands at gold level
		expect(hard.complex).toBeLessThanOrEqual(1);
		expect(hard.rescue).toBeLessThan(easy.rescue * 0.75);
		expect(hard.withRescue).toBeLessThan(0.9);
	});
});
