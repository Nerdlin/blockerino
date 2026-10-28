// Small pixel-art icons for the chess menus, drawn as text: every character is a pixel, '.' is empty. Colors come from
// each icon's own palette, so an icon looks the same on any theme.

export type IconName = "bullet" | "blitz" | "rapid" | "clock" | "friends" | "robot" | "pawn" | "flip" | "pgn" | "newgame" | "sound" | "draw" | "flag" | "undo";

export interface PixelIconDef {
	rows: string[];
	palette: Record<string, string>;
}

export const ICON_SIZE = 10;

export const PIXEL_ICONS: Record<IconName, PixelIconDef> = {
	bullet: {
		palette: { D: "#7A4A12", O: "#F0A02A", Y: "#FFE27A", R: "#E5573C" },
		rows: [
			"..........",
			"...DDDD...",
			".RDOOOOD..",
			"RRDOYYOOD.",
			"RRDOYYOOD.",
			".RDOOOOD..",
			"...DDDD...",
			"..........",
			"..........",
			"..........",
		],
	},
	blitz: {
		palette: { Y: "#FFD34D", O: "#E89A1C" },
		rows: [
			"......YY..",
			".....YY...",
			"....YY....",
			"...YYYYY..",
			".....YYO..",
			"....YYO...",
			"...YYO....",
			"..YO......",
			"..........",
			"..........",
		],
	},
	rapid: {
		palette: { G: "#5CC45C", W: "#F4F4F4" },
		rows: [
			"....GG....",
			"....GG....",
			"..GGGGGG..",
			".GG....GG.",
			".G..W...G.",
			".G..WW..G.",
			".G......G.",
			".GG....GG.",
			"..GGGGGG..",
			"..........",
		],
	},
	clock: {
		palette: { B: "#7FB4FF", W: "#F4F4F4" },
		rows: [
			"...BBBB...",
			"..BB..BB..",
			".BB..W.BB.",
			".B...W..B.",
			".B...WW.B.",
			".B......B.",
			".BB....BB.",
			"..BB..BB..",
			"...BBBB...",
			"..........",
		],
	},
	friends: {
		palette: { B: "#4AC0FF", O: "#FF9B4A" },
		rows: [
			"..........",
			"..BB..OO..",
			".BBBB.OOOO",
			".BBBB.OOOO",
			"..BB..OO..",
			".BBBBBOOOO",
			"BBBBBBOOOO",
			"BBBBBBOOOO",
			"..........",
			"..........",
		],
	},
	robot: {
		palette: { A: "#E7C0FF", P: "#7B3FE4", X: "#B58CFF", W: "#FFFFFF" },
		rows: [
			"....A.....",
			"....A.....",
			".PPPPPPPP.",
			".PXXXXXXP.",
			".PXWXXWXP.",
			".PXXXXXXP.",
			".PXWWWWXP.",
			".PPPPPPPP.",
			"..P....P..",
			"..........",
		],
	},
	pawn: {
		palette: { W: "#F4F4F4", S: "#B8B8C8" },
		rows: [
			"..........",
			"....WW....",
			"...WWWW...",
			"...WWWS...",
			"....WS....",
			"...WWWS...",
			"....WS....",
			"...WWWS...",
			"..WWWWWS..",
			"..........",
		],
	},
	flip: {
		palette: { C: "#7FE0D0" },
		rows: [
			"..........",
			"..CCCCC...",
			".C.....C..",
			".C...C.C..",
			"..CCC.CCC.",
			"...C...C..",
			"..........",
			"..CCCCC...",
			"..........",
			"..........",
		],
	},
	pgn: {
		palette: { W: "#F4F4F4", B: "#6C8CFF" },
		rows: [
			"..WWWWW...",
			"..WBBBWW..",
			"..WBBBBWW.",
			"..WWWWWWW.",
			"..WBBBBBW.",
			"..WWWWWWW.",
			"..WBBBBBW.",
			"..WWWWWWW.",
			"..........",
			"..........",
		],
	},
	newgame: {
		palette: { G: "#5CC45C" },
		rows: [
			"..........",
			"....GG....",
			"....GG....",
			"..GGGGGG..",
			"..GGGGGG..",
			"....GG....",
			"....GG....",
			"..........",
			"..........",
			"..........",
		],
	},
	sound: {
		palette: { Y: "#FFD34D", W: "#F4F4F4" },
		rows: [
			"..........",
			"....Y.....",
			"...YY..W..",
			".YYYY...W.",
			".YYYY.W.W.",
			".YYYY...W.",
			"...YY..W..",
			"....Y.....",
			"..........",
			"..........",
		],
	},
	draw: {
		palette: { W: "#F4F4F4", Y: "#FFD34D" },
		rows: [
			"..........",
			"..WWWWWW..",
			"..........",
			"..YYYYYY..",
			"..........",
			"..WWWWWW..",
			"..........",
			"..........",
			"..........",
			"..........",
		],
	},
	flag: {
		palette: { R: "#E5573C", W: "#F4F4F4" },
		rows: [
			"..W.......",
			"..WRRRR...",
			"..WRRRRR..",
			"..WRRRR...",
			"..W.......",
			"..W.......",
			"..W.......",
			".WWW......",
			"..........",
			"..........",
		],
	},
	undo: {
		palette: { C: "#7FE0D0" },
		rows: [
			"..........",
			"...C......",
			"..CC......",
			".CCCCCCC..",
			"..CC....C.",
			"...C....C.",
			"........C.",
			".....CCC..",
			"..........",
			"..........",
		],
	},
};

/** Every non-empty pixel as [row, col, color]. */
export function iconPixels(name: IconName): [number, number, string][] {
	const { rows, palette } = PIXEL_ICONS[name];
	const pixels: [number, number, string][] = [];
	rows.forEach((row, r) => {
		for (let c = 0; c < row.length; c++) {
			const color = palette[row[c]];
			if (color) pixels.push([r, c, color]);
		}
	});
	return pixels;
}
