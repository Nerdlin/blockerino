jest.mock("@react-native-async-storage/async-storage", () => ({
	__esModule: true,
	default: { getItem: jest.fn(() => Promise.resolve(null)), setItem: jest.fn(() => Promise.resolve()), removeItem: jest.fn(() => Promise.resolve()) },
}));
jest.mock("@/constants/Supabase", () => ({ supabase: { channel: jest.fn(), removeChannel: jest.fn() } }));
jest.mock("@/constants/Sound", () => ({ useSoundSettings: () => ({ playSfx: jest.fn() }) }));
jest.mock("expo-haptics", () => ({}));
jest.mock("react-native-webview", () => ({ WebView: () => null }));

// eslint-disable-next-line import/first -- jest.mock calls are hoisted and must precede the import
import { countShots, shotOutcome } from "./battleFeedback";
// eslint-disable-next-line import/first
import { createDurakState, planDurakFlights } from "./DurakGame";
// eslint-disable-next-line import/first
import { formatSeasonKey } from "../SeasonTitleBadges";
// eslint-disable-next-line import/first
import type { DurakState } from "./types";

describe("Sea Battle feedback", () => {
	it("counts the shots on a board", () => {
		expect(countShots({ "1,1": "hit", "2,2": "miss", "3,3": "miss", "4,4": "pending" })).toEqual({ hit: 1, miss: 2, pending: 1 });
	});

	it("tells a miss, a hit and a sunk ship apart", () => {
		const before = { hit: 1, miss: 1, pending: 0 };
		expect(shotOutcome(before, { hit: 1, miss: 2, pending: 0 }, 0, 0)).toBe("miss");
		expect(shotOutcome(before, { hit: 2, miss: 1, pending: 0 }, 0, 0)).toBe("hit");
		expect(shotOutcome(before, { hit: 2, miss: 1, pending: 0 }, 0, 1)).toBe("sunk");
		// a shot still waiting for its answer, or a cleared board, is no result
		expect(shotOutcome(before, { hit: 1, miss: 1, pending: 1 }, 0, 0)).toBeNull();
		expect(shotOutcome(before, { hit: 0, miss: 0, pending: 0 }, 0, 0)).toBeNull();
	});
});

describe("Durak flight plan", () => {
	const size = { width: 360, height: 500 };

	it("deals six cards to every seat and lands the player's own cards one by one", () => {
		const state = createDurakState(2, ["throw_in"], 36, 0);
		const plan = planDurakFlights(null, state, "player1", size, 1);
		expect(plan.flights).toHaveLength(12);
		expect(plan.roleArrivals.player1).toHaveLength(6);
		expect(plan.roleArrivals.player2).toHaveLength(6);
		const mine = state.hands.player1.map((card) => plan.myArrivals[card]);
		expect(mine.every((ms) => typeof ms === "number")).toBe(true);
		expect([...mine].sort((a, b) => a - b)).toEqual(mine);
		expect(plan.sounds.filter((entry) => entry.sound === "cardDeal")).toHaveLength(12);
	});

	it("plays a card sound when a card goes on the table and nothing for an unchanged state", () => {
		const state = createDurakState(2, ["throw_in"], 36, 0);
		const card = state.hands[state.attacker][0];
		const next: DurakState = {
			...state,
			hands: { ...state.hands, [state.attacker]: state.hands[state.attacker].slice(1) },
			table: [{ attack: card, defense: null }],
		};
		expect(planDurakFlights(state, next, "player1", size, 2).sounds).toEqual([{ sound: "cardPlay", delay: 0 }]);
		expect(planDurakFlights(next, next, "player1", size, 3).flights).toHaveLength(0);
	});

	it("brings the taken cards into the defender's hand", () => {
		const state = createDurakState(2, ["throw_in"], 36, 0);
		const attack = state.hands[state.attacker][0];
		const onTable: DurakState = { ...state, hands: { ...state.hands, [state.attacker]: state.hands[state.attacker].slice(1) }, table: [{ attack, defense: null }] };
		const taken: DurakState = { ...onTable, table: [], hands: { ...onTable.hands, [state.defender]: [...onTable.hands[state.defender], attack] } };
		const plan = planDurakFlights(onTable, taken, state.defender, size, 4);
		expect(plan.sounds.map((entry) => entry.sound)).toContain("cardTake");
		expect(plan.myArrivals[attack]).toBeGreaterThan(0);
	});
});

describe("season titles", () => {
	const t = (key: string) => ({ "season.month.10": "Oct", "season.month.1": "Jan" } as Record<string, string>)[key] ?? key;

	it("shows a season as its month and year", () => {
		expect(formatSeasonKey("2026-10", t)).toBe("Oct 2026");
		expect(formatSeasonKey("2027-01", t)).toBe("Jan 2027");
		expect(formatSeasonKey("weird", t)).toBe("weird");
	});
});
