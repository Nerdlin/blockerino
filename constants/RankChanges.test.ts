jest.mock("./Supabase", () => ({ supabase: { rpc: jest.fn() } }));

import { rankChange } from "./RankChanges";

describe("rankChange", () => {
	const prev = new Map([["Ann", 5], ["Bob", 2], ["Cid", 3]]);

	it("is positive for a climb and negative for a fall", () => {
		expect(rankChange(prev, "Ann", 2)).toBe(3);
		expect(rankChange(prev, "Bob", 4)).toBe(-2);
		expect(rankChange(prev, "Cid", 3)).toBe(0);
	});

	it("is null for a name that was not in the snapshot", () => {
		expect(rankChange(prev, "Dan", 1)).toBeNull();
	});
});
