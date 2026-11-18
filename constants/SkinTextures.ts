// The surface of every piece skin, in the game's own pixel style: one bold 8x8 picture of big pixels drawn inside the
// block's bevel, over the skin's bright block color. The theme is the block's material (a hot ingot, a printed board,
// a ringed planet...), never thin lines or noise, so every skin still reads as a Blockerino block on the dark board.
// No two skins share a picture (SkinFx.test.ts).

export const TEX = 16;

// Block shapes (SkinFx applies them): 1 sharp. Every themed skin keeps the square block of the game.
export const SHAPE_SHARP = 1;
export const SHAPE_SOFT = 2;
export const SHAPE_ROUND = 3;
export const SHAPE_LEAF = 4;
export const SHAPE_LEAF2 = 5;

const W = (a: number) => `rgba(255,255,255,${a})`;
const K = (a: number) => `rgba(0,0,0,${a})`;
function C(hex: string, a = 1): string {
	const n = parseInt(hex.slice(1), 16);
	return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Tones every sprite can use: W bright highlight, w soft light, k shade, K deep shade. */
const BASE_KEYS: Record<string, string> = { W: W(0.92), w: W(0.45), k: K(0.38), K: K(0.62) };

type Sprite = { rows: string[]; keys?: Record<string, string> };

export const SKIN_SPRITES: Record<string, Sprite> = {
	// ---------------------------------------------------------------- mine and stone
	piece_minecraft: { rows: ["w.....k.", "..ww..k.", ".wWw....", "..w...k.", "k....w..", ".k..wWw.", "......w.", ".k..k..."] },
	piece_minecraft_moss: {
		rows: ["gGgGgGgG", "GgGggGgG", "g.g..g.G", "......g.", "..k.....", "......k.", ".k......", "....k..."],
		keys: { g: C("#3F9D2A"), G: C("#A7E36B") },
	},
	piece_minecraft_deepslate: {
		rows: ["kkkkkkkk", "........", "wwwwwwww", "..c.....", "kkkkkkkk", "....cc..", "wwwwwwww", "........"],
		keys: { c: C("#5EF2F5") },
	},
	piece_minecraft_gold: {
		rows: ["........", ".yY...k.", ".yy..yY.", "......y.", "..k.....", "...yY...", "...yy.k.", "........"],
		keys: { y: C("#E8B10C"), Y: C("#FFF2A8") },
	},
	piece_minecraft_nether: {
		rows: ["...o....", "...o....", "...o....", "oooooooo", ".....o..", ".....o..", ".....o..", "oooooooo"],
		keys: { o: C("#FFB000") },
	},
	piece_minecraft_prismarine: {
		rows: ["ww......", "w....W..", "........", ".wwww..w", "w....ww.", "..W.....", ".W.W....", "..W....."],
	},

	// ---------------------------------------------------------------- crystals and gems
	piece_crystal: { rows: ["WWwwwwww", "Ww.ww..k", "w.WWWw.k", "w.WWWw.k", "w.www..k", "w......k", "w.....kk", "wkkkkkkK"] },
	piece_crystal_aqua: { rows: ["..W...W.", ".WwW.WwW", ".WwW.WwW", ".Wwk.Wwk", ".Wwk.Wwk", ".Wwk.Wwk", ".Wwk.Wwk", "........"] },
	piece_crystal_amethyst: { rows: ["...W....", "..Ww..W.", "..Ww.Ww.", "W.Ww.Ww.", "WwWwkWwk", "WwkkkWwk", "kkkkkkkk", "KKKKKKKK"] },
	piece_crystal_rose: { rows: ["........", ".WW.ww..", "WWwwwww.", "Wwwwwww.", ".wwwwk..", "..wwk...", "...k....", "........"] },
	piece_crystal_emerald: { rows: ["kkkkkkkk", "k......k", "k.wwww.k", "k.wWWw.k", "k.wWWw.k", "k.wwww.k", "k......k", "kkkkkkkk"] },
	piece_crystal_sun: {
		rows: ["w..w..w.", ".w.w.w..", "..WWW...", "wwWYWww.", "..WWW...", ".w.w.w..", "w..w..w.", "........"],
		keys: { Y: C("#FFB000") },
	},
	piece_ruby_cut: { rows: ["k.....k.", ".kwWwk..", ".wWWWw..", ".WWWWW..", ".wWWWw..", ".kwWwk..", "k.....k.", "........"] },
	piece_sapphire_cut: { rows: ["...W....", "W..W..W.", ".W.W.W..", "..WWW...", "WWWWWWW.", "..WWW...", ".W.W.W..", "W..W..W."] },
	piece_chest_prism: {
		rows: ["...W....", "..WwW...", "..WwW...", ".WwwwW.r", ".WwwwWoy", "WwwwwwWg", "WWWWWWWb", "........"],
		keys: { r: C("#FF4D4D"), o: C("#FF9F1C"), y: C("#FDE047"), g: C("#4ADE80"), b: C("#38BDF8") },
	},
	piece_chest_relic: {
		rows: ["........", "W..W..W.", "WW.W.WW.", "WWWWWWW.", "WrWWWrW.", "WWWWWWW.", "........", "kkkkkkk."],
		keys: { r: C("#DC2626") },
	},

	// ---------------------------------------------------------------- fire and forge
	piece_lava: {
		rows: ["kkkoykkk", "kkoykkkk", "ooykkkoo", "ykkkkoyk", "kkkkoykk", "kkkoykkk", "oooykkko", "ykkkkkoy"],
		keys: { o: C("#FF7A00"), y: C("#FFE066") },
	},
	piece_lava_obsidian: {
		rows: ["........", ".yyyyyy.", ".yWWWWy.", ".yWWWWy.", ".yyyyyy.", "..kkkk..", "..kkkk..", "........"],
		keys: { y: C("#FFE066"), W: C("#FFF8D6") },
	},
	piece_lava_solar: {
		rows: [".wWWw...", "wWWWWw..", "WWYYWW..", "WWYYWW.w", "wWWWWw.W", ".wWWw..W", "......W.", "....WW.."],
		keys: { Y: C("#FFF3B0") },
	},
	piece_lava_ember: {
		rows: ["........", ".o....y.", "...o....", "y.....o.", "..o.y...", "......o.", ".y.o....", "....o..y"],
		keys: { o: C("#FF6B1A"), y: C("#FFE066") },
	},
	piece_lava_basalt: {
		rows: [".kk..kk.", "kwwkkwwk", "kwwkkwwk", ".kk..kk.", ".kk..kk.", "kookkwwk", "kookkwwk", ".kk..kk."],
		keys: { o: C("#FF7A00") },
	},
	piece_lava_magma: {
		rows: ["..oo....", ".oYYo...", ".oYYo.o.", "..oo.oYo", "......o.", ".o......", "oYo..oo.", ".o..oYYo"],
		keys: { o: C("#FF9F1C"), Y: C("#FFF3B0") },
	},
	piece_magma_ice: {
		rows: ["bbbbbbbo", "bWbbbbo.", "bbbbbo..", "bbbbo...", "bbbo....", "bbo..y..", "bo......", "o......."],
		keys: { b: C("#BAE6FD", 0.85), o: C("#FFB000"), y: C("#FFE066") },
	},
	piece_chest_dragon: { rows: [".www.www", "w...w...", "..www.ww", ".w...w..", ".www.www", "w...w...", "..www.ww", ".w...w.."] },

	// ---------------------------------------------------------------- circuits and tech
	piece_circuit: {
		rows: ["t..t....", "t..tttt.", "ttt...t.", "..kkkkt.", "..kWWk..", "..kkkk..", "t...t...", "tttt.ttt"],
		keys: { t: C("#FDE047") },
	},
	piece_circuit_matrix: {
		rows: ["W.....w.", "w..W..w.", "w..w..W.", "...w..w.", ".W.w....", ".w.....W", ".w..W..w", ".w..w..w"],
		keys: { W: C("#EFFFB0") },
	},
	piece_circuit_neon: {
		rows: ["cccccc..", "c....c..", "c.mmmcm.", "c.m..cm.", "cccm.cm.", "..m..c..", "..mmmc..", "........"],
		keys: { c: C("#A5F3FC"), m: C("#FF7AE6") },
	},
	piece_circuit_plasma: { rows: ["....WW..", "...WW...", "..WWW...", ".WWWWWW.", "....WW..", "...WW...", "..WW....", ".W......"] },
	piece_circuit_terminal: {
		rows: ["KKKKKKKK", "KgKKKKKK", "KKgKKKKK", "KgKKggKK", "KKKKKKKK", "KggggKKK", "KKKKKKKK", "KgggKKKK"],
		keys: { g: C("#7CFFB2") },
	},
	piece_circuit_candy: {
		rows: ["........", "w.kkkk.w", "w.kmmk.w", "w.kkkk.w", "w.kcck.w", "w.kkkk.w", "w.kkkk.w", "........"],
		keys: { m: C("#FF2BD6"), c: C("#A2D2FF") },
	},
	piece_copper_wire: {
		rows: ["oo..oo..", ".oo..oo.", "..oo..oo", "o..oo..o", "oo..oo..", ".oo..oo.", "..oo..oo", "t..oo..o"],
		keys: { o: C("#FDBA74"), t: C("#2DD4BF") },
	},
	piece_laser_grid: {
		rows: ["c...c...", "c...c...", "cccccccc", "c...c...", "rrrrrrrr", "c...c...", "cccccccc", "c...c..."],
		keys: { c: C("#A5F3FC"), r: C("#FF5A5A") },
	},
	piece_night_market: {
		rows: ["...kk...", "..LLLL..", ".LLLLLL.", ".rrrrrr.", ".LLLLLL.", ".rrrrrr.", "..LLLL..", "...kk..."],
		keys: { L: C("#FDE047"), r: C("#BE123C") },
	},
	piece_arcade_gum: {
		rows: ["........", "..wwww..", ".wWw..w.", ".wW...w.", ".w....w.", "..wwww..", "...pp...", "..pppp.."],
		keys: { p: C("#22D3EE") },
	},

	// ---------------------------------------------------------------- space and sky
	piece_cosmic_ore: { rows: ["........", ".kk...w.", "kKKk....", "kKKw..kk", ".kw..kKk", "......kw", "..w.....", "........"] },
	piece_chest_cosmic: {
		rows: ["W.......", "...pp..W", "..pppp..", "rrrrrrrr", "..pppp..", "...pp...", ".W....W.", "........"],
		keys: { p: C("#FDE68A"), r: W(0.6) },
	},
	piece_void_pearl: { rows: ["........", "..wWWw..", ".wKKKKw.", "WKKKKKKW", ".wKKKKw.", "..wWWw..", "........", "W.....W."] },
	piece_moonstone: { rows: ["..WWW...", ".WWw....", "WWw.....", "WWw...W.", "WWw.....", ".WWw....", "..WWW...", "......W."] },
	piece_storm_cloud: {
		rows: ["..ww....", ".wWWw.w.", "wWWWWwWw", "WWWWWWWW", "kkkkkkkk", "...yy...", "..yy....", "...y...."],
		keys: { y: C("#FDE047") },
	},
	piece_chest_aurora: {
		rows: ["a.......", ".a....aa", "..a..a..", "...WW...", "...WW...", "..v..v..", "vv....v.", ".......v"],
		keys: { a: C("#99F6E4"), v: C("#C4B5FD") },
	},
	// season pass: a low sun on a horizon, and a star bursting
	piece_season_dawn: {
		rows: ["........", "...yy...", "..yYYy..", ".yYYYYy.", "oooooooo", "........", "wwww.www", "..ww.w.."],
		keys: { y: C("#FDE047"), Y: C("#FFF7C2"), o: C("#FB923C") },
	},
	piece_season_nova: {
		rows: ["W......W", ".W.ww.W.", "..wWWw..", ".wWYYWw.", ".wWYYWw.", "..wWWw..", ".W.ww.W.", "W......W"],
		keys: { Y: C("#F0ABFC") },
	},
	piece_aurora_glass: { rows: ["w.w.w.w.", "wWw.wWw.", "wWwWwWwW", ".WwWwWw.", ".w.WwW..", "...w.w..", "........", "........"] },

	// ---------------------------------------------------------------- toxic and dark
	piece_radioactive: {
		rows: ["kk..kk..", "k..kk..k", "..kk..kk", ".kkWW.k.", "kk.WWkk.", "k..kk..k", "..kk..kk", ".kk..kk."],
		keys: { k: C("#1A2E05", 0.85), W: C("#F7FEE7") },
	},
	piece_chest_toxic: {
		rows: ["gggggggg", "gggggggg", "g.gg.g.g", "g..g...g", "...g.W..", ".W....W.", "....W...", ".W......"],
		keys: { g: C("#65A30D") },
	},
	piece_lime_shadow: {
		rows: ["LL....LL", "L......L", "...L....", "..LWL...", "...L....", "........", "L......L", "LL....LL"],
		keys: { L: C("#ECFCCB") },
	},
	piece_ghost_ink: { rows: ["..WWW...", ".WWWWW..", "WWkWkWW.", "WWWWWWW.", "WWWkWWW.", ".WWWWWW.", "..WWWWW.", "....WW.."] },
	piece_shadow_gold: {
		rows: ["YYY..YYY", "Y......Y", "Y..YY..Y", "..YkkY..", "..YkkY..", "Y..YY..Y", "Y......Y", "YYY..YYY"],
		keys: { Y: C("#FDE68A") },
	},
	piece_royal_velvet: {
		rows: ["k..Y..k.", ".k...k..", "..kYk...", "Y..k..Y.", "..kYk...", ".k...k..", "k..Y..k.", "........"],
		keys: { Y: C("#FDE047") },
	},

	// ---------------------------------------------------------------- nature and food
	piece_forest_mushroom: {
		rows: [".WW...W.", ".WW.....", "......WW", "W.WW..WW", "kkkkkkkk", "...ss...", "...ss...", "..ssss.."],
		keys: { s: C("#FEF3C7") },
	},
	piece_jade_tile: { rows: ["kkkkkkkk", "k......k", "k.kkkk.k", "k.k..k.k", "k.k.kk.k", "k.k....k", "k.kkkkkk", "k......."] },
	piece_topaz_tile: { rows: ["WW......", "Ww......", "..w.....", "...ww...", "....ww..", ".....ww.", "......wk", ".....kkk"] },
	piece_desert_clay: {
		rows: ["....YY..", "...YYYY.", "g...YY..", "gg.g....", ".ggg....", ".g..wwww", "wwww....", "....kkkk"],
		keys: { Y: C("#FFF1C2"), g: C("#4D7C0F") },
	},
	piece_snow_mint: { rows: ["WWWWWWWW", "WW.WW.WW", "W......W", "...W....", ".W.W.W..", "..WWW...", ".W.W.W..", "...W...."] },
	piece_ocean_shell: {
		rows: ["..wWWw..", ".wWwWwW.", "wWwWwWwW", "WwWwWwWw", ".WwWwWw.", "..WwWw..", "...cc...", "...cc..."],
		keys: { c: C("#FB7185") },
	},
	piece_pearl_shell: {
		rows: ["........", "...WW...", "..WWWw..", "..WWww..", "...ww...", "kkkkkkkk", ".kpkpkp.", "..kkkk.."],
		keys: { p: C("#FBCFE8") },
	},
	piece_neon_fruit: {
		rows: ["....gg..", "...g..g.", "..g....g", ".rr...rr", "rWrr.rWr", "rrrr.rrr", ".rr...rr", "........"],
		keys: { r: C("#DC2626"), g: C("#166534") },
	},
	piece_peach_soda: { rows: ["WWWWWWWW", ".W.W..W.", "........", "..ww....", ".w..w.W.", "..ww....", "W....ww.", "....w..w"] },
	piece_candy_pop: { rows: ["..WWWW..", ".W....W.", "W.WWW..W", "W.W..W.W", "W.W.WW.W", "W..W...W", ".W..WWW.", "..WW...."] },
	piece_paper_cut: { rows: ["......WW", "kkkk.WWk", "......kk", "kkkkkk..", "........", "kkkkkk..", "........", "kkkk...."] },
	piece_ink_stamp: {
		rows: ["..rrrr..", ".r....r.", "r..ss..r", "r.ssss.r", "r..ss..r", "r.s..s.r", ".r....r.", "..rrrr.."],
		keys: { r: C("#111827", 0.85), s: C("#EF4444") },
	},
	piece_monochrome: { rows: ["KK.KK.KK", "KK.KK.KK", "........", "k.k.k.k.", "........", ".w.w.w.w", "........", "W...W..."] },
};

export type TextureLayer = { color: string; d: string };

/** The sprite on the 16x16 grid (each sprite pixel 2x2), light pixels with a soft shadow below-right. */
function paint(pieceSkinId: string): (string | null)[] | null {
	const sprite = SKIN_SPRITES[pieceSkinId];
	if (!sprite) return null;
	const keys = { ...BASE_KEYS, ...(sprite.keys ?? {}) };
	const px: (string | null)[] = new Array(TEX * TEX).fill(null);
	sprite.rows.forEach((row, y) =>
		[...row].forEach((ch, x) => {
			const col = keys[ch];
			if (!col) return;
			for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) px[(y * 2 + dy) * TEX + x * 2 + dx] = col;
		}),
	);
	const light = (c: string | null) => c !== null && c.startsWith("rgba(255,255,255");
	const shade: number[] = [];
	for (let y = 0; y < TEX - 1; y++) for (let x = 0; x < TEX - 1; x++) if (light(px[y * TEX + x]) && px[(y + 1) * TEX + x + 1] === null) shade.push((y + 1) * TEX + x + 1);
	for (const i of shade) px[i] = K(0.3);
	return px;
}

const CACHE = new Map<string, TextureLayer[]>();

/** The skin's picture as one path per color (horizontal runs of pixels), or null when the skin has none. */
export function textureOf(pieceSkinId: string): TextureLayer[] | null {
	const cached = CACHE.get(pieceSkinId);
	if (cached) return cached;
	const px = paint(pieceSkinId);
	if (!px) return null;
	const byColor = new Map<string, string>();
	for (let y = 0; y < TEX; y++) {
		let x = 0;
		while (x < TEX) {
			const col = px[y * TEX + x];
			if (!col) {
				x++;
				continue;
			}
			let run = 1;
			while (x + run < TEX && px[y * TEX + x + run] === col) run++;
			byColor.set(col, (byColor.get(col) ?? "") + `M${x} ${y}h${run}v1h${-run}z`);
			x += run;
		}
	}
	const layers = [...byColor.entries()].map(([color, d]) => ({ color, d }));
	CACHE.set(pieceSkinId, layers);
	return layers;
}

/** A fingerprint of the picture, for checking that no two skins share one. */
export function textureKey(pieceSkinId: string): string | null {
	const px = paint(pieceSkinId);
	return px ? px.map((p) => p ?? "").join("|") : null;
}

/** Every themed skin keeps the square block of the game; the plain classic block has no picture. */
export function textureShape(pieceSkinId: string): number {
	return SKIN_SPRITES[pieceSkinId] ? SHAPE_SHARP : 0;
}

// Kept for the test that checks recipes only name real skins.
export const SKIN_TEXTURES = SKIN_SPRITES;
