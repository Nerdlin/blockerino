import { UI_GLYPHS } from "./UiGlyphs";

describe("pixel UI glyphs", () => {
	it("draws every glyph as a 9x9 grid using only palette characters", () => {
		for (const [name, glyph] of Object.entries(UI_GLYPHS)) {
			expect({ name, rows: glyph.rows.length }).toEqual({ name, rows: 9 });
			for (const row of glyph.rows) {
				expect({ name, length: row.length }).toEqual({ name, length: 9 });
				expect(row).toMatch(/^[.abcd]+$/);
			}
			expect(glyph.rows.join("")).toMatch(/[abcd]/);
		}
	});
});
