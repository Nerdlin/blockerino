jest.mock("@react-native-async-storage/async-storage", () =>
	require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { createEmptyBlockStyle, createFilledBlockStyle, pieceColors } from "./Piece";
import { SHOP_ITEMS } from "./Shop";

const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const contrastOnBlack = (hex: string) => {
	const lin = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
	const [r, g, b] = hexToRgb(hex);
	return (0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) + 0.05) / 0.05;
};
const colorsOf = (skin: string) => pieceColors.map((color) => (createFilledBlockStyle(color, 7, skin) as { backgroundColor: string }).backgroundColor);

describe("piece skin rendering", () => {
	it("uses exact palettes for expanded shop skins instead of falling back to classic colors", () => {
		const classicStyle = createFilledBlockStyle(pieceColors[0]) as { backgroundColor?: string };
		const shadowGoldStyle = createFilledBlockStyle(pieceColors[0], 7, "piece_shadow_gold") as { backgroundColor?: string };
		const forestStyle = createFilledBlockStyle(pieceColors[1], 7, "piece_forest_mushroom") as { backgroundColor?: string };

		expect(shadowGoldStyle.backgroundColor).toBe("#515b85");
		expect(forestStyle.backgroundColor).toBe("#a3e635");
		expect(shadowGoldStyle.backgroundColor).not.toBe(classicStyle.backgroundColor);
	});

	it("keeps every color of every skin visible on the dark board (near-black blocks used to vanish)", () => {
		for (const item of SHOP_ITEMS.filter((entry) => entry.category === "piece_skin")) {
			for (const color of colorsOf(item.id)) expect([item.id, contrastOnBlack(color) >= 1.8]).toEqual([item.id, true]);
		}
	});

	it("gives the variants of a skin family their own colors", () => {
		expect(colorsOf("piece_lava_obsidian")).not.toEqual(colorsOf("piece_lava"));
		expect(colorsOf("piece_crystal_rose")).not.toEqual(colorsOf("piece_crystal"));
	});

	it("ensures empty block style has no glowing artifacts or elevation", () => {
		const emptyStyle = createEmptyBlockStyle("rgb(40, 40, 40)") as {
			elevation?: number;
			shadowOpacity?: number;
			shadowColor?: string;
			backgroundColor?: string;
			borderWidth?: number;
		};

		expect(emptyStyle.elevation).toBe(0);
		expect(emptyStyle.shadowOpacity).toBe(0);
		expect(emptyStyle.shadowColor).toBe("transparent");
		expect(emptyStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
		expect(emptyStyle.borderWidth).toBe(0.5);
	});
});
