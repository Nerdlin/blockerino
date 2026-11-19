// A 10x10 pixel picture for every chapter of the level map. Level n of a chapter opens row n of its picture, so a
// finished chapter shows the whole picture. Every row has at least one pixel, so every level opens something.
// "." is empty; any other letter is a key of the chapter's palette.

export interface ChapterPicture {
	rows: string[];
	palette: Record<string, string>;
}

export const CHAPTER_PICTURES: Record<number, ChapterPicture> = {
	// 1 Basics: a trophy
	1: {
		rows: [
			".aaaaaaaa.",
			"ayYYyyyoya",
			"ayYyyyyoya",
			"ayyyyyyoya",
			".ayyyyoya.",
			"..ayyyoa..",
			"....aya...",
			"....aya...",
			"..aaaaaaa.",
			".ayyyyyyya",
		],
		palette: { a: "#4A3200", y: "#FFC93C", Y: "#FFF0A0", o: "#E09A00" },
	},
	// 2 Gems: a cut gem
	2: {
		rows: [
			"..aaaaaa..",
			".abbWbbcca",
			"abWbbbbcca",
			"aaaaaaaaaa",
			"adbbbbbcda",
			".adbbbbcda",
			"..adbbcda.",
			"...adbcda.",
			"....adda..",
			".....aa...",
		],
		palette: { a: "#0B3C6F", b: "#7DF9FF", c: "#2BC4E8", d: "#1B8FBF", W: "#FFFFFF" },
	},
	// 3 Combo: a flame
	3: {
		rows: [
			"....aa....",
			"...arra...",
			"..arrrra..",
			"..arrrrra.",
			".arryyrrra",
			".arryyyrra",
			".arryywyra",
			".arryyyyra",
			"..arryyra.",
			"...aaaaa..",
		],
		palette: { a: "#7A1B00", r: "#FF3B1F", y: "#FFC93C", w: "#FFF3B0" },
	},
	// 4 Tight: a padlock
	4: {
		rows: [
			"...aaaa...",
			"..as..sa..",
			"..as..sa..",
			".aaaaaaaa.",
			".ayyyyyya.",
			".ayyaaayya",
			".ayyyayyya",
			".ayyyayyya",
			".ayyyyyyya",
			".aaaaaaaa.",
		],
		palette: { a: "#2B2F3A", s: "#C0C8D4", y: "#FFC93C" },
	},
	// 5 Timed: an hourglass
	5: {
		rows: [
			"ffffffffff",
			".aggggggga",
			"..agssga..",
			"...assa...",
			"....aa....",
			"....aa....",
			"...asssa..",
			"..agssssa.",
			".agssssssa",
			"ffffffffff",
		],
		palette: { a: "#3B2A00", g: "#BFEFFF", s: "#FFC93C", f: "#8B5A2B" },
	},
};

/** The opacity of a picture row for the stars its level earned: 0 hidden (a dark outline shows), 1 in full colour. */
export function rowReveal(stars: number): number {
	if (stars >= 3) return 1;
	return stars > 0 ? 0.55 : 0;
}

/** True when every row is open with three stars. */
export function pictureComplete(rowStars: number[]): boolean {
	return rowStars.length === 10 && rowStars.every((s) => s >= 3);
}
