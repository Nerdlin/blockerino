import { SKIN_BEVEL, SKIN_CRYSTAL, SKIN_LAVA, SKIN_LIQUID, SKIN_NEON, SKIN_STONE, getSkinKind, getSkinKindId, skinAppear, skinClear, skinDecorStyle } from "./SkinFx";
import { SHOP_ITEMS } from "./Shop";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

describe("skin kinds", () => {
	it("every piece skin in the shop has a kind, and the families map as expected", () => {
		const skins = SHOP_ITEMS.filter((item) => item.id.startsWith("piece_"));
		expect(skins.length).toBeGreaterThan(10);
		for (const skin of skins) expect(["bevel", "stone", "crystal", "lava", "neon", "liquid"]).toContain(getSkinKind(skin.id));
		expect(getSkinKind("piece_classic")).toBe("bevel");
		expect(getSkinKind("piece_minecraft_moss")).toBe("stone");
		expect(getSkinKind("piece_crystal_rose")).toBe("crystal");
		expect(getSkinKind("piece_lava_ember")).toBe("lava");
		expect(getSkinKind("piece_circuit_neon")).toBe("neon");
		expect(getSkinKind("piece_aurora_glass")).toBe("liquid");
		// every kind is used by at least one shop skin
		const used = new Set(skins.map((skin) => getSkinKind(skin.id)));
		expect(used.size).toBe(6);
	});

	it("the bevel has no surface layer; the others do", () => {
		expect(skinDecorStyle(SKIN_BEVEL, 40, "#ff0000")).toBeNull();
		for (const kind of [SKIN_STONE, SKIN_CRYSTAL, SKIN_LAVA, SKIN_NEON, SKIN_LIQUID]) expect(skinDecorStyle(kind, 40, "#ff0000")).not.toBeNull();
		expect(getSkinKindId("piece_classic")).toBe(SKIN_BEVEL);
	});

	it("appearing ends at rest and clearing ends invisible", () => {
		for (const kind of [SKIN_BEVEL, SKIN_STONE, SKIN_CRYSTAL, SKIN_LAVA, SKIN_NEON, SKIN_LIQUID]) {
			const end = skinAppear(kind, 1, 40) as { opacity?: number };
			expect(end.opacity ?? 1).toBe(1);
			const gone = skinClear(kind, 1, 40, 10, 10, 90) as { opacity?: number };
			expect(gone.opacity).toBeCloseTo(0);
		}
	});
});

describe("skin surface geometry", () => {
	// a layer with both a width and a right inset is placed by its width (right is ignored), which drew it shifted
	it("never sets a size together with the opposite inset, and stays inside the block", () => {
		for (const size of [28, 40, 52]) for (const kind of [SKIN_STONE, SKIN_CRYSTAL, SKIN_LAVA, SKIN_NEON, SKIN_LIQUID]) {
			const d = skinDecorStyle(kind, size) as Record<string, number>;
			expect(d.width !== undefined && d.right !== undefined).toBe(false);
			expect(d.height !== undefined && d.bottom !== undefined).toBe(false);
			const w = d.width ?? size - d.left - d.right;
			expect(d.left).toBeGreaterThanOrEqual(-2);
			expect(d.left + w).toBeLessThanOrEqual(size);
			expect(w).toBeGreaterThan(0);
		}
	});
});
