import { createEmptyBlockStyle, createFilledBlockStyle, pieceColors } from "./Piece";

describe("piece skin rendering", () => {
	it("uses exact palettes for expanded shop skins instead of falling back to classic colors", () => {
		const classicStyle = createFilledBlockStyle(pieceColors[0]) as { backgroundColor?: string };
		const shadowGoldStyle = createFilledBlockStyle(pieceColors[0], 7, "piece_shadow_gold") as { backgroundColor?: string };
		const forestStyle = createFilledBlockStyle(pieceColors[1], 7, "piece_forest_mushroom") as { backgroundColor?: string };

		expect(shadowGoldStyle.backgroundColor).toBe("#020617");
		expect(forestStyle.backgroundColor).toBe("#a3e635");
		expect(shadowGoldStyle.backgroundColor).not.toBe(classicStyle.backgroundColor);
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
