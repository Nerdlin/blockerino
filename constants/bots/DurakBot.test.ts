import { chooseDurakAction, maxTableCards, DurakBotView } from "./DurakBot";

const seeded = (seed: number) => () => {
	seed = (seed * 1664525 + 1013904223) % 4294967296;
	return seed / 4294967296;
};

const base: DurakBotView = {
	hand: ["6S", "9H", "KD", "7C", "AH", "10H"],
	table: [],
	trump: "H",
	deckCount: 12,
	isAttacker: false,
	isDefender: false,
	defenderHandSize: 6,
};

describe("chooseDurakAction as attacker", () => {
	it("leads with a card from its hand on every level, and the cheapest plain card on medium", () => {
		for (const difficulty of ["easy", "medium", "hard"] as const) {
			const action = chooseDurakAction({ ...base, isAttacker: true }, difficulty, seeded(3));
			expect(action.type).toBe("attack");
			if (action.type === "attack") expect(base.hand).toContain(action.card);
		}
		expect(chooseDurakAction({ ...base, isAttacker: true }, "medium", seeded(1))).toEqual({ type: "attack", card: "6S" });
	});

	it("waits while its attack is unanswered and passes when nothing can be thrown in", () => {
		const open = { ...base, isAttacker: true, table: [{ attack: "6S", defense: null }] };
		expect(chooseDurakAction(open, "hard").type).toBe("wait");

		const answered = { ...base, isAttacker: true, hand: ["9H", "KD"], table: [{ attack: "6S", defense: "7S" }] };
		expect(chooseDurakAction(answered, "hard").type).toBe("pass");
	});

	it("only throws in ranks that are on the table, and never past the limit", () => {
		const answered = { ...base, isAttacker: true, hand: ["6D", "KD"], table: [{ attack: "6S", defense: "7S" }] };
		for (let i = 0; i < 30; i++) {
			const action = chooseDurakAction(answered, "medium", seeded(i + 1));
			if (action.type === "attack") expect(action.card).toBe("6D");
		}
		const full = { ...answered, defenderHandSize: 0 };
		expect(maxTableCards(full.table, 0)).toBe(1);
		expect(chooseDurakAction(full, "medium").type).toBe("pass");
	});
});

describe("chooseDurakAction as defender", () => {
	it("beats an attack with the cheapest card that works, and keeps trumps when a plain card beats it", () => {
		const view = { ...base, isDefender: true, hand: ["9S", "7H", "KS"], table: [{ attack: "6S", defense: null }] };
		expect(chooseDurakAction(view, "medium", () => 0.99)).toEqual({ type: "defend", card: "9S", index: 0 });
	});

	it("takes the cards when it cannot beat the attack", () => {
		const view = { ...base, isDefender: true, hand: ["6D", "7C"], table: [{ attack: "KS", defense: null }] };
		for (const difficulty of ["easy", "medium", "hard"] as const) {
			expect(chooseDurakAction(view, difficulty, seeded(5)).type).toBe("take");
		}
	});

	it("answers a trump attack only with a higher trump", () => {
		const view = { ...base, isDefender: true, hand: ["AS", "7H", "QH"], table: [{ attack: "10H", defense: null }] };
		const action = chooseDurakAction(view, "medium", () => 0.99);
		expect(action).toEqual({ type: "defend", card: "QH", index: 0 });
	});

	it("targets the first open attack on the table", () => {
		const view = { ...base, isDefender: true, hand: ["8D", "JD"], table: [{ attack: "6S", defense: "7S" }, { attack: "6D", defense: null }] };
		const action = chooseDurakAction(view, "medium", () => 0.99);
		expect(action).toEqual({ type: "defend", card: "8D", index: 1 });
	});

	it("hard keeps a high trump for later instead of spending it on a small plain card", () => {
		const view = { ...base, isDefender: true, hand: ["QH", "KD", "7C", "8C", "9C"], table: [{ attack: "6S", defense: null }], deckCount: 14 };
		expect(chooseDurakAction(view, "hard").type).toBe("take");
	});
});
