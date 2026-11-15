jest.mock("@react-native-async-storage/async-storage", () =>
	require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("./Supabase", () => ({ supabase: { rpc: jest.fn() } }));
jest.mock("./AccountSession", () => ({ getAccountSession: jest.fn() }));

import { ROULETTE_LENGTH, ROULETTE_WIN_INDEX, buildRouletteStrip, chestOdds, isLuckyHour, itemRarity, luckyHourTimes } from "./Chests";
import { SHOP_ITEMS } from "./Shop";

describe("chest odds", () => {
	it("add up to 100% for every chest, lucky or not", () => {
		for (const size of ["small", "big"] as const) {
			for (const lucky of [false, true]) {
				expect(chestOdds(size, lucky).reduce((sum, odd) => sum + odd.percent, 0)).toBe(100);
			}
		}
	});

	it("are rarer in the lucky hour", () => {
		const legendary = (lucky: boolean) => chestOdds("big", lucky).find((odd) => odd.kind === "legendary")!.percent;
		expect(legendary(true)).toBeGreaterThan(legendary(false));
	});
});

describe("lucky hour", () => {
	it("runs 17:00-18:00 UTC", () => {
		expect(isLuckyHour(new Date("2026-11-15T17:30:00Z"))).toBe(true);
		expect(isLuckyHour(new Date("2026-11-15T18:00:00Z"))).toBe(false);
	});

	it("counts down to the next one", () => {
		expect(luckyHourTimes(new Date("2026-11-15T16:00:00Z"))).toEqual({ startsIn: 3600_000, endsIn: 0 });
		expect(luckyHourTimes(new Date("2026-11-15T17:45:00Z"))).toEqual({ startsIn: 0, endsIn: 15 * 60_000 });
		expect(luckyHourTimes(new Date("2026-11-15T19:00:00Z")).startsIn).toBe(22 * 3600_000);
	});
});

describe("roulette strip", () => {
	it("puts the prize under the marker", () => {
		const item = SHOP_ITEMS.find((candidate) => candidate.price > 900)!;
		const strip = buildRouletteStrip({ size: "big", kind: "item", itemId: item.id, coins: 300, rarity: "legendary" }, item);
		expect(strip).toHaveLength(ROULETTE_LENGTH);
		expect(strip[ROULETTE_WIN_INDEX]).toEqual({ kind: "item", item, rarity: "legendary" });
	});

	it("shows a coin prize as coins", () => {
		const strip = buildRouletteStrip({ size: "small", kind: "coins", coins: 420, rarity: "common" }, undefined);
		expect(strip[ROULETTE_WIN_INDEX]).toEqual({ kind: "coins", coins: 420, rarity: "common" });
	});

	it("rates items by price as the server does", () => {
		expect([itemRarity(300), itemRarity(301), itemRarity(900), itemRarity(901)]).toEqual(["common", "rare", "epic", "legendary"]);
	});
});
