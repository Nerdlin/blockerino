import { CHAPTERS, LEVELS_PER_CHAPTER } from "./Levels";
import { CHAPTER_PICTURES, pictureComplete, rowReveal } from "./ChapterArt";

describe("chapter pictures", () => {
	it("has one 10x10 picture for every chapter", () => {
		for (const { chapter } of CHAPTERS) {
			const picture = CHAPTER_PICTURES[chapter];
			expect(picture).toBeDefined();
			expect(picture.rows).toHaveLength(LEVELS_PER_CHAPTER);
			for (const row of picture.rows) expect(row).toHaveLength(10);
		}
	});

	it("uses only colours of its palette and opens something with every level", () => {
		for (const { chapter } of CHAPTERS) {
			const { rows, palette } = CHAPTER_PICTURES[chapter];
			for (const row of rows) {
				const pixels = [...row].filter((ch) => ch !== ".");
				expect(pixels.length).toBeGreaterThan(0);
				for (const ch of pixels) expect(palette[ch]).toMatch(/^#[0-9A-Fa-f]{6}$/);
			}
		}
	});

	it("gives every chapter its own picture", () => {
		const keys = CHAPTERS.map(({ chapter }) => CHAPTER_PICTURES[chapter].rows.join("|"));
		expect(new Set(keys).size).toBe(keys.length);
	});
});

describe("revealing a picture", () => {
	it("shows a row by the stars of its level", () => {
		expect(rowReveal(0)).toBe(0);
		expect(rowReveal(1)).toBeGreaterThan(0);
		expect(rowReveal(2)).toBeLessThan(1);
		expect(rowReveal(3)).toBe(1);
	});

	it("is complete only with three stars on all ten levels", () => {
		expect(pictureComplete([3, 3, 3, 3, 3, 3, 3, 3, 3, 3])).toBe(true);
		expect(pictureComplete([3, 3, 3, 3, 3, 3, 3, 3, 3, 2])).toBe(false);
		expect(pictureComplete([3, 3, 3])).toBe(false);
	});
});
