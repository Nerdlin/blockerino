import { createFilledBlockStyle, pieceColors } from "./Piece";

describe("piece skin rendering", () => {
	it("uses exact palettes for expanded shop skins instead of falling back to classic colors", () => {
		const classicStyle = createFilledBlockStyle(pieceColors[0]) as { backgroundColor?: string };
		const shadowGoldStyle = createFilledBlockStyle(pieceColors[0], 7, "piece_shadow_gold") as { backgroundColor?: string };
		const forestStyle = createFilledBlockStyle(pieceColors[1], 7, "piece_forest_mushroom") as { backgroundColor?: string };

		expect(shadowGoldStyle.backgroundColor).toBe("#020617");
		expect(forestStyle.backgroundColor).toBe("#a3e635");
		expect(shadowGoldStyle.backgroundColor).not.toBe(classicStyle.backgroundColor);
	});
});
