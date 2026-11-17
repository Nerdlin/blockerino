import { SKIN_BEVEL, SKIN_CANDY, SKIN_CRYSTAL, SKIN_GLASS, SKIN_LAVA, SKIN_LIQUID, SKIN_METAL, SKIN_NEON, SKIN_ORB, SKIN_PIXEL, SKIN_STONE, SKIN_WOOD, getSkinKind, getSkinKindId, glyphOf, kindOf, skinAppear, skinClear } from "./SkinFx";
import { SKIN_GLYPHS } from "./SkinGlyphs";
import { SHOP_ITEMS } from "./Shop";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

const KINDS = [SKIN_BEVEL, SKIN_STONE, SKIN_CRYSTAL, SKIN_LAVA, SKIN_NEON, SKIN_LIQUID, SKIN_PIXEL, SKIN_GLASS, SKIN_METAL, SKIN_WOOD, SKIN_CANDY, SKIN_ORB];
const skins = SHOP_ITEMS.filter((item) => item.category === "piece_skin");

describe("skin families", () => {
	it("every piece skin has a family, and the families map as expected", () => {
		for (const skin of skins) expect(["bevel", "stone", "crystal", "lava", "neon", "liquid", "pixel", "glass", "metal", "wood", "candy", "orb"]).toContain(getSkinKind(skin.id));
		expect(getSkinKind("piece_classic")).toBe("bevel");
		expect(getSkinKind("piece_minecraft_moss")).toBe("stone");
		expect(getSkinKind("piece_crystal_rose")).toBe("crystal");
		expect(getSkinKind("piece_lava_ember")).toBe("lava");
		expect(getSkinKind("piece_circuit_neon")).toBe("neon");
		expect(getSkinKind("piece_aurora_glass")).toBe("glass");
		expect(getSkinKind("piece_moonstone")).toBe("liquid");
		expect(new Set(skins.map((skin) => getSkinKind(skin.id))).size).toBe(12);
	});

	it("appearing ends at rest and clearing ends invisible, for every family", () => {
		for (const kind of KINDS) for (const size of [28, 40]) {
			expect((skinAppear(kind, 1, size) as { opacity?: number }).opacity ?? 1).toBe(1);
			expect((skinClear(kind, 1, size, 10, 10, 90) as { opacity?: number }).opacity).toBeCloseTo(0);
		}
	});
});

describe("one look per skin", () => {
	const codes = skins.map((skin) => getSkinKindId(skin.id));

	it("leaves only the classic block plain and gives every other skin a badge no other skin has", () => {
		expect(getSkinKindId("piece_classic")).toBe(0);
		const badges = skins.filter((skin) => skin.id !== "piece_classic").map((skin) => glyphOf(getSkinKindId(skin.id)));
		expect(badges.every((rows) => rows !== null)).toBe(true);
		expect(new Set(badges.map((rows) => rows!.join("/"))).size).toBe(badges.length);
	});

	it("keeps each skin's family in its code", () => {
		skins.forEach((skin, index) => expect(kindOf(codes[index])).toBe(KINDS.indexOf(kindOf(getSkinKindId(skin.id)))));
	});

	it("has spare badges for new skins, all of them different and 5x5", () => {
		expect(SKIN_GLYPHS.length).toBeGreaterThanOrEqual(skins.length + 5);
		expect(new Set(SKIN_GLYPHS.map((rows) => rows.join("/"))).size).toBe(SKIN_GLYPHS.length);
		for (const rows of SKIN_GLYPHS) {
			expect(rows).toHaveLength(5);
			for (const row of rows) expect(row).toMatch(/^[.#]{5}$/);
		}
	});
});
