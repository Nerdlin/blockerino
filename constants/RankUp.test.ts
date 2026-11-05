jest.mock("@react-native-async-storage/async-storage", () =>
	require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import AsyncStorage from "@react-native-async-storage/async-storage";
import { checkRankUp, rankIndexFor } from "./RankUp";

const MINS = [0, 800, 1000, 1200, 1400, 1600];

beforeEach(() => AsyncStorage.clear());

describe("rank-up", () => {
	it("puts a rating into its rank", () => {
		expect(rankIndexFor(799, MINS)).toBe(0);
		expect(rankIndexFor(1000, MINS)).toBe(2);
		expect(rankIndexFor(2400, MINS)).toBe(5);
	});

	it("only remembers the first rating, then celebrates a climb once", async () => {
		expect(await checkRankUp(950, MINS)).toBeNull();
		expect(await checkRankUp(990, MINS)).toBeNull();
		expect(await checkRankUp(1010, MINS)).toBe(2);
		expect(await checkRankUp(1020, MINS)).toBeNull();
	});

	it("does not celebrate a drop, and celebrates climbing back", async () => {
		await checkRankUp(1010, MINS);
		expect(await checkRankUp(980, MINS)).toBeNull();
		expect(await checkRankUp(1005, MINS)).toBe(2);
	});
});
