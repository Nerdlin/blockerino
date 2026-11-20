import { formatRarityPercent, parseAchievementRarity, rarityClass, rarityPercent } from "./AchievementRarity";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

describe("achievement rarity", () => {
	const rarity = { total: 200, counts: { first_steps: 150, score_myth: 3, ghost: 999 } };

	it("reads the server answer and drops what does not fit", () => {
		expect(parseAchievementRarity({ total: 12, counts: { a: 3, b: "x", c: -1 } })).toEqual({ total: 12, counts: { a: 3 } });
		expect(parseAchievementRarity(null)).toBeNull();
		expect(parseAchievementRarity({ total: "many" })).toBeNull();
	});

	it("turns counts into a share, and says nothing for a tiny base", () => {
		expect(rarityPercent(rarity, "first_steps")).toBe(75);
		expect(rarityPercent(rarity, "score_myth")).toBe(1.5);
		expect(rarityPercent(rarity, "unknown")).toBe(0);
		expect(rarityPercent(rarity, "ghost")).toBe(100);
		expect(rarityPercent({ total: 4, counts: { a: 4 } }, "a")).toBeNull();
		expect(rarityPercent(null, "a")).toBeNull();
	});

	it("prints and classes the share", () => {
		expect(formatRarityPercent(0.4)).toBe("<1");
		expect(formatRarityPercent(2.64)).toBe("2.6");
		expect(formatRarityPercent(12.4)).toBe("12");
		expect(formatRarityPercent(0)).toBe("0");
		expect([2, 10, 30, 80].map(rarityClass)).toEqual(["epic", "rare", "uncommon", "common"]);
	});
});
