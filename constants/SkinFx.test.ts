import { kindOf, SKIN_BEVEL, SKIN_CANDY, SKIN_CRYSTAL, SKIN_GLASS, SKIN_LAVA, SKIN_LIQUID, SKIN_METAL, SKIN_NEON, SKIN_ORB, SKIN_PIXEL, SKIN_STONE, SKIN_WOOD, getSkinKind, getSkinKindId, skinAppear, skinClear, skinDecorStyle } from "./SkinFx";
import { SHOP_ITEMS } from "./Shop";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

const SURFACED = [SKIN_STONE, SKIN_CRYSTAL, SKIN_LAVA, SKIN_NEON, SKIN_LIQUID, SKIN_PIXEL, SKIN_GLASS, SKIN_METAL, SKIN_WOOD, SKIN_CANDY, SKIN_ORB];

describe("skin kinds", () => {
	it("every piece skin in the shop has a kind, and the families map as expected", () => {
		const skins = SHOP_ITEMS.filter((item) => item.id.startsWith("piece_"));
		expect(skins.length).toBeGreaterThan(10);
		for (const skin of skins) expect(["bevel", "stone", "crystal", "lava", "neon", "liquid", "pixel", "glass", "metal", "wood", "candy", "orb"]).toContain(getSkinKind(skin.id));
		expect(getSkinKind("piece_classic")).toBe("bevel");
		expect(getSkinKind("piece_minecraft_moss")).toBe("stone");
		expect(getSkinKind("piece_crystal_rose")).toBe("crystal");
		expect(getSkinKind("piece_lava_ember")).toBe("lava");
		expect(getSkinKind("piece_circuit_neon")).toBe("neon");
		expect(getSkinKind("piece_aurora_glass")).toBe("glass");
		expect(getSkinKind("piece_moonstone")).toBe("liquid");
		// every kind is used by at least one shop skin
		const used = new Set(skins.map((skin) => getSkinKind(skin.id)));
		expect(used.size).toBe(12);
	});

	it("the bevel has no surface layer; the others do", () => {
		expect(skinDecorStyle(SKIN_BEVEL, 40, "#ff0000")).toBeNull();
		for (const kind of SURFACED) expect(skinDecorStyle(kind, 40, "#ff0000")).not.toBeNull();
		expect(getSkinKindId("piece_classic")).toBe(SKIN_BEVEL);
	});

	it("appearing ends at rest and clearing ends invisible", () => {
		for (const kind of [SKIN_BEVEL, ...SURFACED]) {
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
		for (const size of [28, 40, 52]) for (const kind of SURFACED) {
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

describe("one style per skin", () => {
	const skins = SHOP_ITEMS.filter((item) => item.category === "piece_skin");
	const codes = skins.map((skin) => getSkinKindId(skin.id));

	it("gives no two skins the same look (pattern and shape; the kind's own surface counts per kind)", () => {
		const looks = codes.map((code) => {
			const pattern = (code >> 4) & 15;
			return `${pattern === 0 ? `k${kindOf(code)}` : `p${pattern}`}:${(code >> 8) & 15}`;
		});
		expect(new Set(looks).size).toBe(skins.length);
	});

	it("keeps each skin's family and leaves only the classic plain", () => {
		skins.forEach((skin, index) => {
			expect(kindOf(codes[index])).toBe(getSkinKindId(skin.id) & 15);
		});
		expect(getSkinKindId("piece_classic")).toBe(0);
		expect(codes.filter((code) => code === 0)).toHaveLength(1);
	});

	it("draws every style inside its block and ends its animations cleanly", () => {
		for (const code of codes) for (const size of [28, 40, 52]) {
			const d = skinDecorStyle(code, size) as Record<string, number> | null;
			if (d) {
				expect(d.width !== undefined && d.right !== undefined).toBe(false);
				expect(d.height !== undefined && d.bottom !== undefined).toBe(false);
				const w = d.width ?? size - d.left - d.right;
				expect(d.left).toBeGreaterThanOrEqual(-2);
				expect(d.left + w).toBeLessThanOrEqual(size);
				expect(w).toBeGreaterThan(0);
			}
			expect((skinAppear(code, 1, size) as { opacity?: number }).opacity ?? 1).toBe(1);
			expect((skinClear(code, 1, size, 10, 10, 90) as { opacity?: number }).opacity).toBeCloseTo(0);
		}
	});
});
