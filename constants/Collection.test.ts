jest.mock("@react-native-async-storage/async-storage", () =>
	require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("./Supabase", () => ({ supabase: { rpc: jest.fn() } }));
jest.mock("./AccountSession", () => ({ getAccountSession: jest.fn() }));

import { EXCLUSIVE_SET, buildCollectionSets, collectibleItems, setKeys, summarizeCollection } from "./Collection";

describe("collection sets", () => {
	it("groups every collectible item into one set", () => {
		const sets = buildCollectionSets([], []);
		expect(sets.reduce((sum, set) => sum + set.items.length, 0)).toBe(collectibleItems().length);
		expect(sets.find((set) => set.id === EXCLUSIVE_SET)?.items).toHaveLength(12);
		// the server counts the same sets (collection_set_items): spot checks from the migration dry run
		expect(sets.find((set) => set.id === "piece_skin:common")?.items).toHaveLength(10);
		expect(sets.find((set) => set.id === "music:rare")?.items).toHaveLength(22);
	});

	it("keeps ids that start with their category, as the server derives it", () => {
		const prefix: Record<string, string> = { piece_skin: "piece_" };
		for (const item of collectibleItems()) expect(item.id.startsWith(prefix[item.category] ?? `${item.category}_`)).toBe(true);
	});

	it("marks a set complete and claimable once", () => {
		const common = buildCollectionSets([], []).find((set) => set.id === "piece_skin:common")!;
		const owned = common.items.map((item) => item.id);
		expect(buildCollectionSets(owned, []).find((set) => set.id === common.id)).toMatchObject({ complete: true, claimed: false, keys: 1 });
		const state = { keys: 0, keyShards: 0, pity: 0, collectionSets: [] as string[] };
		expect(summarizeCollection(owned, state).claimable).toBe(1);
		expect(summarizeCollection(owned, { ...state, collectionSets: [common.id] }).claimable).toBe(0);
	});

	it("pays more for rarer sets", () => {
		expect(["x:common", "x:rare", "x:epic", "x:legendary", EXCLUSIVE_SET].map(setKeys)).toEqual([1, 2, 3, 5, 10]);
	});
});
