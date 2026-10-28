import { ICON_SIZE, IconName, PIXEL_ICONS, iconPixels } from "./PixelIcons";

describe("pixel icons", () => {
	const names = Object.keys(PIXEL_ICONS) as IconName[];

	it("are all 10x10 and only use characters from their palette", () => {
		for (const name of names) {
			const { rows, palette } = PIXEL_ICONS[name];
			expect(rows).toHaveLength(ICON_SIZE);
			for (const row of rows) {
				expect(row).toHaveLength(ICON_SIZE);
				for (const char of row) expect(char === "." || palette[char] !== undefined).toBe(true);
			}
		}
	});

	it("draw something visible and use every color they declare", () => {
		for (const name of names) {
			const pixels = iconPixels(name);
			expect(pixels.length).toBeGreaterThan(8);
			const used = new Set(PIXEL_ICONS[name].rows.join(""));
			for (const key of Object.keys(PIXEL_ICONS[name].palette)) expect(used.has(key)).toBe(true);
		}
	});

	it("are all different", () => {
		const shapes = names.map((name) => JSON.stringify(iconPixels(name)));
		expect(new Set(shapes).size).toBe(names.length);
	});
});
