// A tiny 5x7 bitmap font for text drawn into the "Share a moment" GIF (constants/MomentFrames.ts). The game's own
// pixel font (Silkscreen) is a web/native font file that cannot be read pixel by pixel from plain JS, so the GIF
// carries its own: upper-case Latin, Cyrillic, digits and a few signs. Lower case is drawn as upper case.

export const GLYPH_WIDTH = 5;
export const GLYPH_HEIGHT = 7;
/** Space between two letters, in font pixels. */
export const GLYPH_GAP = 1;

// Each glyph: 7 rows of 5 characters, "#" = ink.
const RAW: Record<string, string> = {
	"A": " ### |#   #|#   #|#####|#   #|#   #|#   #",
	"B": "#### |#   #|#   #|#### |#   #|#   #|#### ",
	"C": " ### |#   #|#    |#    |#    |#   #| ### ",
	"D": "#### |#   #|#   #|#   #|#   #|#   #|#### ",
	"E": "#####|#    |#    |#### |#    |#    |#####",
	"F": "#####|#    |#    |#### |#    |#    |#    ",
	"G": " ### |#   #|#    |# ###|#   #|#   #| ####",
	"H": "#   #|#   #|#   #|#####|#   #|#   #|#   #",
	"I": " ### |  #  |  #  |  #  |  #  |  #  | ### ",
	"J": "  ###|   # |   # |   # |#  # |#  # | ##  ",
	"K": "#   #|#  # |# #  |##   |# #  |#  # |#   #",
	"L": "#    |#    |#    |#    |#    |#    |#####",
	"M": "#   #|## ##|# # #|# # #|#   #|#   #|#   #",
	"N": "#   #|##  #|# # #|#  ##|#   #|#   #|#   #",
	"O": " ### |#   #|#   #|#   #|#   #|#   #| ### ",
	"P": "#### |#   #|#   #|#### |#    |#    |#    ",
	"Q": " ### |#   #|#   #|#   #|# # #|#  # | ## #",
	"R": "#### |#   #|#   #|#### |# #  |#  # |#   #",
	"S": " ####|#    |#    | ### |    #|    #|#### ",
	"T": "#####|  #  |  #  |  #  |  #  |  #  |  #  ",
	"U": "#   #|#   #|#   #|#   #|#   #|#   #| ### ",
	"V": "#   #|#   #|#   #|#   #|#   #| # # |  #  ",
	"W": "#   #|#   #|#   #|# # #|# # #|# # #| # # ",
	"X": "#   #|#   #| # # |  #  | # # |#   #|#   #",
	"Y": "#   #|#   #| # # |  #  |  #  |  #  |  #  ",
	"Z": "#####|    #|   # |  #  | #   |#    |#####",
	"0": " ### |#   #|#  ##|# # #|##  #|#   #| ### ",
	"1": "  #  | ##  |  #  |  #  |  #  |  #  | ### ",
	"2": " ### |#   #|    #|   # |  #  | #   |#####",
	"3": "#####|   # |  #  |   # |    #|#   #| ### ",
	"4": "   # |  ## | # # |#  # |#####|   # |   # ",
	"5": "#####|#    |#### |    #|    #|#   #| ### ",
	"6": "  ## | #   |#    |#### |#   #|#   #| ### ",
	"7": "#####|    #|   # |  #  | #   | #   | #   ",
	"8": " ### |#   #|#   #| ### |#   #|#   #| ### ",
	"9": " ### |#   #|#   #| ####|    #|   # | ##  ",
	" ": "     |     |     |     |     |     |     ",
	"+": "     |  #  |  #  |#####|  #  |  #  |     ",
	"-": "     |     |     |#####|     |     |     ",
	"!": "  #  |  #  |  #  |  #  |  #  |     |  #  ",
	".": "     |     |     |     |     | ##  | ##  ",
	",": "     |     |     |     | ##  |  #  | #   ",
	":": "     | ##  | ##  |     | ##  | ##  |     ",
	"/": "    #|    #|   # |  #  | #   |#    |#    ",
	"?": " ### |#   #|    #|   # |  #  |     |  #  ",
	"'": "  #  |  #  |     |     |     |     |     ",
	"×": "     |#   #| # # |  #  | # # |#   #|     ",
	"#": " # # |#####| # # | # # | # # |#####| # # ",
	"%": "##   |##  #|   # |  #  | #   |#  ##|   ##",
	// Cyrillic letters that do not share a shape with a Latin one
	"Б": "#####|#    |#    |#### |#   #|#   #|#### ",
	"Г": "#####|#    |#    |#    |#    |#    |#    ",
	"Д": "  ## | #  #| #  #| #  #| #  #|#####|#   #",
	"Ж": "# # #|# # #| ### |  #  | ### |# # #|# # #",
	"З": " ### |#   #|    #|  ## |    #|#   #| ### ",
	"И": "#   #|#   #|#  ##|# # #|##  #|#   #|#   #",
	"Й": " # # |#   #|#  ##|# # #|##  #|#   #|#   #",
	"Л": "  ###| #  #| #  #| #  #| #  #| #  #|#   #",
	"П": "#####|#   #|#   #|#   #|#   #|#   #|#   #",
	"У": "#   #|#   #|#   #| ####|    #|#   #| ### ",
	"Ф": "  #  | ### |# # #|# # #|# # #| ### |  #  ",
	"Ц": "#  # |#  # |#  # |#  # |#  # |#####|    #",
	"Ч": "#   #|#   #|#   #| ####|    #|    #|    #",
	"Ш": "# # #|# # #|# # #|# # #|# # #|# # #|#####",
	"Щ": "# # #|# # #|# # #|# # #|# # #|#####|    #",
	"Ъ": "##   | #   | #   | ### | #  #| #  #| ### ",
	"Ы": "#   #|#   #|#   #|##  #|# # #|# # #|##  #",
	"Ь": "#    |#    |#    |#### |#   #|#   #|#### ",
	"Э": " ### |#   #|    #|  ###|    #|#   #| ### ",
	"Ю": "#  # |# # #|# # #|### #|# # #|# # #|#  # ",
	"Я": " ####|#   #|#   #| ####|  # #| #  #|#   #",
	"Ё": " # # |#####|#    |#### |#    |#    |#####",
};

// Cyrillic letters drawn with the Latin glyph of the same shape.
const SAME_AS: Record<string, string> = {
	"А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O", "Р": "P", "С": "C", "Т": "T", "Х": "X",
};

function parseGlyph(rows: string): Uint8Array {
	const bits = new Uint8Array(GLYPH_WIDTH * GLYPH_HEIGHT);
	rows.split("|").forEach((row, y) => {
		for (let x = 0; x < GLYPH_WIDTH; x++) bits[y * GLYPH_WIDTH + x] = row[x] === "#" ? 1 : 0;
	});
	return bits;
}

const GLYPHS = new Map<string, Uint8Array>();
for (const [char, rows] of Object.entries(RAW)) GLYPHS.set(char, parseGlyph(rows));
for (const [char, latin] of Object.entries(SAME_AS)) GLYPHS.set(char, GLYPHS.get(latin)!);

/** The glyph for a character (7 rows of 5 bits), or undefined when the font has none; lower case maps to upper case. */
export function getGlyph(char: string): Uint8Array | undefined {
	return GLYPHS.get(char) ?? GLYPHS.get(char.toUpperCase());
}

/** Width of a line of text in font pixels at size 1 (unknown characters are skipped, as when drawing). */
export function measureText(text: string): number {
	let width = 0;
	let glyphs = 0;
	for (const char of text) {
		if (!getGlyph(char)) continue;
		glyphs++;
		width += GLYPH_WIDTH;
	}
	return glyphs > 0 ? width + (glyphs - 1) * GLYPH_GAP : 0;
}
