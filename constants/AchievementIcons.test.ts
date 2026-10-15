jest.mock("@react-native-async-storage/async-storage", () =>
	require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { ACHIEVEMENT_DEFINITIONS } from "./Achievements";
import {
	ACHIEVEMENT_GLYPHS,
	ACHIEVEMENT_ICON_BY_ID,
	ACHIEVEMENT_ICON_SIZE,
	getAchievementGlyph,
} from "./AchievementIcons";

describe("achievement pixel icons", () => {
	it("has an icon for every achievement", () => {
		for (const achievement of ACHIEVEMENT_DEFINITIONS) {
			expect(getAchievementGlyph(achievement.id)).not.toBeNull();
		}
	});

	it("does not reference unknown achievements or glyphs", () => {
		const ids = new Set(ACHIEVEMENT_DEFINITIONS.map((achievement) => achievement.id));
		for (const [id, glyphName] of Object.entries(ACHIEVEMENT_ICON_BY_ID)) {
			expect(ids.has(id)).toBe(true);
			expect(ACHIEVEMENT_GLYPHS[glyphName]).toBeDefined();
		}
	});

	it("draws every glyph as a square grid using only palette characters", () => {
		for (const [name, glyph] of Object.entries(ACHIEVEMENT_GLYPHS)) {
			expect(glyph.rows).toHaveLength(ACHIEVEMENT_ICON_SIZE);
			for (const row of glyph.rows) {
				expect({ name, length: row.length }).toEqual({ name, length: ACHIEVEMENT_ICON_SIZE });
				expect(row).toMatch(/^[.abcd]+$/);
			}
			expect(glyph.rows.join("")).toMatch(/[abcd]/);
		}
	});

	it("uses every glyph for at least one achievement", () => {
		const used = new Set(Object.values(ACHIEVEMENT_ICON_BY_ID));
		for (const name of Object.keys(ACHIEVEMENT_GLYPHS)) {
			expect(used.has(name as keyof typeof ACHIEVEMENT_GLYPHS)).toBe(true);
		}
	});
});
