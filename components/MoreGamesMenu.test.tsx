jest.mock("@react-native-async-storage/async-storage", () => ({
	__esModule: true,
	default: {
		getItem: jest.fn(() => Promise.resolve(null)),
		setItem: jest.fn(() => Promise.resolve()),
		removeItem: jest.fn(() => Promise.resolve()),
	},
}));

jest.mock("@/constants/Supabase", () => ({
	supabase: {
		channel: jest.fn(),
		removeChannel: jest.fn(),
	},
	getMoreGameLeaderboard: jest.fn(() => Promise.resolve([])),
	getPlayerMoreGameRating: jest.fn(() => Promise.resolve(null)),
	submitMoreGameMatchResult: jest.fn(() => Promise.resolve([])),
	submitMoreGameSoloResult: jest.fn(() => Promise.resolve(null)),
}));

jest.mock("./StylizedButton", () => () => null);
jest.mock("./SimplePopupView", () => ({ children }: any) => children);

// eslint-disable-next-line import/first -- jest.mock calls are hoisted and must precede the import
import {
	canBeatDurakCard,
	getDurakNetPrize,
	getDurakPayout,
	getShipCells,
	getTicTacToeWinner,
	isShipPlacementValid,
	resolveDurakCardTarget,
} from "./MoreGamesMenu";

describe("More Games rules", () => {
	it("detects tic-tac-toe wins", () => {
		expect(getTicTacToeWinner(["X", "X", "X", null, "O", null, "O", null, null])).toBe("X");
		expect(getTicTacToeWinner(["O", "X", null, "X", "O", null, "X", null, "O"])).toBe("O");
	});

	it("keeps Battleship ship lengths as occupied cells", () => {
		const destroyer = { id: "b2", name: "Destroyer", length: 2, x: 4, y: 3, orientation: "h" as const };

		expect(getShipCells(destroyer)).toEqual(["4,3", "5,3"]);
	});

	it("rejects overlapping Battleship placements", () => {
		const fleet = [
			{ id: "b2", name: "Destroyer", length: 2, x: 4, y: 3, orientation: "h" as const },
			{ id: "b3", name: "Cruiser", length: 3, x: 0, y: 0, orientation: "h" as const },
		];

		expect(isShipPlacementValid({ ...fleet[1], x: 5, y: 3 }, fleet)).toBe(false);
		expect(isShipPlacementValid({ ...fleet[1], x: 0, y: 5 }, fleet)).toBe(true);
	});

	it("uses Durak trump and suit rules for defense", () => {
		expect(canBeatDurakCard("9H", "7H", "S")).toBe(true);
		expect(canBeatDurakCard("7H", "9H", "S")).toBe(false);
		expect(canBeatDurakCard("6S", "AH", "S")).toBe(true);
		expect(canBeatDurakCard("AH", "6S", "S")).toBe(false);
	});

	it("prefers an explicit defense target over accidental transfer", () => {
		const table = [
			{ attack: "7H", defense: null },
			{ attack: "6D", defense: null },
		];

		expect(resolveDurakCardTarget(table, "7D", "S", ["transfer"], null)).toEqual({ index: 1, action: "defend" });
		expect(resolveDurakCardTarget(table, "7D", "S", ["transfer"], 0)).toEqual({ index: 0, action: "transfer" });
	});

	it("settles the Durak pot so the winner nets (players - 1) * bet", () => {
		// Everyone antes their bet; the winner is credited the gross pot to offset
		// their own ante, leaving a net gain of (players - 1) * bet.
		expect(getDurakPayout(100, 2)).toBe(200);
		expect(getDurakNetPrize(100, 2)).toBe(100);
		expect(getDurakPayout(100, 6)).toBe(600);
		expect(getDurakNetPrize(100, 6)).toBe(500);
		// A zero bet keeps everything at zero (no coins move).
		expect(getDurakNetPrize(0, 6)).toBe(0);
	});
});
