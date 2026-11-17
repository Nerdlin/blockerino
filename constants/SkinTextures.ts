// The surface of every piece skin: a 16x16 pixel picture drawn over the skin's colored block, in the skin's theme
// (space skins carry nebulae and stars, radioactive ones a warning trefoil, circuits are printed boards...). No two
// skins share a picture (SkinTextures.test.ts). The block's own color still shows through where the picture is clear
// or translucent, so the three colors of a skin stay apart on the board.

export const TEX = 16;

// Block shapes a theme can ask for (SkinFx applies them): 1 sharp, 2 soft corners, 3 round, 4 leaf, 5 other leaf.
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

function seeded(seed: string): () => number {
	let h = 1779033703 ^ seed.length;
	for (let i = 0; i < seed.length; i++) {
		h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	return () => {
		h = Math.imul(h ^ (h >>> 16), 2246822507);
		h = Math.imul(h ^ (h >>> 13), 3266489909);
		h ^= h >>> 16;
		return (h >>> 0) / 4294967296;
	};
}

/** A 16x16 pixel canvas with a few drawing tools. */
export class Canvas {
	readonly px: (string | null)[] = new Array(TEX * TEX).fill(null);
	readonly rnd: () => number;
	constructor(seed: string) {
		this.rnd = seeded(seed);
	}
	set(x: number, y: number, c: string | null) {
		x = Math.round(x);
		y = Math.round(y);
		if (x < 0 || y < 0 || x >= TEX || y >= TEX) return;
		this.px[y * TEX + x] = c;
	}
	get(x: number, y: number) {
		return x < 0 || y < 0 || x >= TEX || y >= TEX ? null : this.px[y * TEX + x];
	}
	fill(c: string) {
		this.rect(0, 0, TEX, TEX, c);
	}
	rect(x: number, y: number, w: number, h: number, c: string) {
		for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
	}
	frame(t: number, c: string) {
		this.rect(0, 0, TEX, t, c);
		this.rect(0, TEX - t, TEX, t, c);
		this.rect(0, t, t, TEX - 2 * t, c);
		this.rect(TEX - t, t, t, TEX - 2 * t, c);
	}
	line(x0: number, y0: number, x1: number, y1: number, c: string) {
		const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
		for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
	}
	path(points: [number, number][], c: string) {
		for (let i = 1; i < points.length; i++) this.line(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], c);
	}
	disc(cx: number, cy: number, r: number, c: string) {
		for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.set(x, y, c);
	}
	ring(cx: number, cy: number, r: number, c: string, t = 1) {
		for (let y = 0; y < TEX; y++)
			for (let x = 0; x < TEX; x++) {
				const d = Math.sqrt((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2);
				if (d <= r && d > r - t) this.set(x, y, c);
			}
	}
	/** Pixels where test(x, y) holds. */
	where(test: (x: number, y: number) => boolean, c: string) {
		for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) if (test(x, y)) this.set(x, y, c);
	}
	noise(density: number, c: string, area?: (x: number, y: number) => boolean) {
		for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) if ((!area || area(x, y)) && this.rnd() < density) this.set(x, y, c);
	}
	/** Pixel rows drawn from a string map: each char picks a color from keys ("." leaves the pixel). */
	sprite(x0: number, y0: number, rows: string[], keys: Record<string, string>) {
		rows.forEach((row, j) => [...row].forEach((ch, i) => keys[ch] && this.set(x0 + i, y0 + j, keys[ch])));
	}
	/** Shading of a raised tile: light top-left edge, dark bottom-right edge. */
	bevel(t = 1, light = W(0.28), dark = K(0.28)) {
		for (let k = 0; k < t; k++) {
			this.rect(k, k, TEX - 2 * k, 1, light);
			this.rect(k, k, 1, TEX - 2 * k, light);
			this.rect(k, TEX - 1 - k, TEX - 2 * k, 1, dark);
			this.rect(TEX - 1 - k, k, 1, TEX - 2 * k, dark);
		}
	}
}

type Recipe = { shape?: number; draw: (c: Canvas) => void };

/** Light pixels get a soft shadow below-right, so the picture still reads on a white or pale block. */
function finish(c: Canvas) {
	const light = (p: string | null) => p !== null && p.startsWith("rgba(255,255,255");
	const shade: [number, number][] = [];
	for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) if (light(c.get(x, y)) && c.get(x + 1, y + 1) === null) shade.push([x + 1, y + 1]);
	for (const [x, y] of shade) c.set(x, y, K(0.2));
}

function paint(pieceSkinId: string, recipe: Recipe): Canvas {
	const c = new Canvas(pieceSkinId);
	recipe.draw(c);
	finish(c);
	return c;
}

const STAR4 = ["..#..", ".###.", "#####", ".###.", "..#.."];
const SPARK = [".#.", "###", ".#."];

export const SKIN_TEXTURES: Record<string, Recipe> = {
	// ---------------------------------------------------------------- mines and stone
	piece_minecraft: {
		shape: SHAPE_SHARP,
		draw: (c) => {
			// chunky ore cube: two-tone rock noise, a few gem flecks, a hard pixel bevel
			c.noise(0.22, K(0.18));
			c.noise(0.16, W(0.16));
			c.rect(4, 5, 2, 2, W(0.75));
			c.rect(10, 9, 2, 2, W(0.7));
			c.set(4, 5, W(0.95));
			c.set(10, 9, W(0.95));
			c.bevel(1, W(0.3), K(0.35));
		},
	},
	piece_minecraft_moss: {
		shape: SHAPE_SOFT,
		draw: (c) => {
			// moss creeping down over stone: a fuzzy green cap with drips, tufts of grass on top
			c.noise(0.2, K(0.15));
			c.where((x, y) => y < 4 + ((x * 7) % 3) + (x % 5 === 0 ? 3 : 0), C("#3F7D20", 0.85));
			c.where((x, y) => y < 2 + ((x * 3) % 2), C("#7BD34F", 0.9));
			c.noise(0.25, C("#A7E36B", 0.9), (x, y) => y < 4);
			c.noise(0.12, C("#3F7D20", 0.5), (x, y) => y > 8);
		},
	},
	piece_minecraft_deepslate: {
		shape: SHAPE_SHARP,
		draw: (c) => {
			// layered slate: dark and light strata with a crack and one cold cyan gem vein
			for (let y = 0; y < TEX; y++) if (y % 4 === 0) c.rect(0, y, TEX, 1, K(0.35));
			for (let y = 0; y < TEX; y++) if (y % 4 === 1) c.rect(0, y, TEX, 1, W(0.12));
			c.noise(0.08, K(0.25));
			c.path([[3, 2], [5, 6], [4, 9], [6, 13]], K(0.45));
			c.path([[10, 6], [12, 7], [13, 9]], C("#2CCED2", 0.95));
			c.set(11, 7, C("#B8FBFF", 1));
		},
	},
	piece_minecraft_gold: {
		shape: SHAPE_SHARP,
		draw: (c) => {
			// gold ore: rough rock with three nugget clusters that catch the light
			c.noise(0.25, K(0.2));
			c.noise(0.12, W(0.12));
			const nugget = (x: number, y: number) => {
				c.sprite(x, y, [".##", "###", "##."], { "#": C("#FFD54A") });
				c.set(x + 1, y, C("#FFF6C2"));
				c.set(x + 2, y + 2, C("#9A6A00"));
			};
			nugget(2, 3);
			nugget(10, 2);
			nugget(6, 10);
			c.bevel(1, W(0.2), K(0.35));
		},
	},
	piece_minecraft_nether: {
		shape: SHAPE_SHARP,
		draw: (c) => {
			// infernal bricks: dark brick courses with glowing orange mortar
			c.fill(K(0.35));
			for (let row = 0; row < 4; row++) {
				const y = row * 4;
				c.rect(0, y + 3, TEX, 1, C("#FF6A00", 0.95));
				const off = row % 2 === 0 ? 0 : 4;
				for (let x = off; x < TEX; x += 8) c.rect(x, y, 1, 3, C("#FF6A00", 0.9));
			}
			c.noise(0.06, C("#FFD54A", 0.9), (x, y) => y % 4 === 3);
			c.noise(0.1, W(0.1));
		},
	},
	piece_minecraft_prismarine: {
		shape: SHAPE_SOFT,
		draw: (c) => {
			// sea glass: frosted and tumbled, with wavy light lines and air bubbles
			c.fill(W(0.18));
			for (let x = 0; x < TEX; x++) {
				c.set(x, 4 + Math.round(Math.sin(x / 2.2) * 1.2), W(0.55));
				c.set(x, 10 + Math.round(Math.sin(x / 2.2 + 2) * 1.2), W(0.4));
			}
			c.ring(4.5, 12.5, 2, W(0.75));
			c.set(11, 3, W(0.85));
			c.set(13, 7, W(0.7));
			c.rect(1, 1, 3, 1, W(0.7));
			c.rect(1, 1, 1, 3, W(0.7));
		},
	},

	// ---------------------------------------------------------------- crystals and gems
	piece_crystal: {
		shape: SHAPE_SOFT,
		draw: (c) => {
			// a cut gem seen from above: bright table in the middle, facets lit from the top left
			c.where((x, y) => x + y < 15 && x < y, W(0.25));
			c.where((x, y) => x + y < 15 && x >= y, W(0.45));
			c.where((x, y) => x + y >= 15 && x < y, K(0.25));
			c.where((x, y) => x + y >= 15 && x >= y, K(0.1));
			c.rect(5, 5, 6, 6, W(0.3));
			c.rect(5, 5, 6, 1, W(0.7));
			c.sprite(2, 2, SPARK, { "#": W(0.95) });
		},
	},
	piece_crystal_aqua: {
		shape: SHAPE_LEAF,
		draw: (c) => {
			// a cluster of long prisms standing up, each with a lit face and a shadow face
			const prism = (x: number, top: number, w: number) => {
				c.rect(x, top + 2, w, TEX - top - 2, W(0.28));
				c.rect(x + Math.floor(w / 2), top + 2, Math.ceil(w / 2), TEX - top - 2, K(0.18));
				c.sprite(x, top, w === 3 ? [".#.", "###"] : [".##.", "####"], { "#": W(0.6) });
				c.rect(x, top + 2, 1, TEX - top - 2, W(0.6));
			};
			prism(1, 5, 3);
			prism(5, 1, 4);
			prism(10, 4, 3);
			prism(13, 8, 3);
		},
	},
	piece_crystal_amethyst: {
		shape: SHAPE_ROUND,
		draw: (c) => {
			// a split geode: stone rind, then a ring of crystal points around a dark hollow
			c.ring(8, 8, 8, K(0.45), 2);
			c.ring(8, 8, 6, W(0.4), 2);
			c.disc(8, 8, 4, K(0.5));
			for (let a = 0; a < 8; a++) {
				const ang = (a / 8) * Math.PI * 2;
				c.line(8 + Math.cos(ang) * 5, 8 + Math.sin(ang) * 5, 8 + Math.cos(ang) * 3, 8 + Math.sin(ang) * 3, W(0.85));
			}
			c.set(8, 8, C("#E0AAFF"));
		},
	},
	piece_crystal_rose: {
		shape: SHAPE_LEAF2,
		draw: (c) => {
			// rose quartz: a heart-shaped cut with soft sparkles
			c.sprite(2, 3, [
				".###...###.",
				"#####.#####",
				"###########",
				"###########",
				".#########.",
				"..#######..",
				"...#####...",
				"....###....",
				".....#.....",
			], { "#": W(0.5) });
			c.rect(4, 4, 2, 2, W(0.95));
			c.sprite(11, 10, SPARK, { "#": W(0.95) });
			c.set(1, 13, W(0.8));
		},
	},
	piece_crystal_emerald: {
		shape: SHAPE_SHARP,
		draw: (c) => {
			// emerald step cut: nested rectangles with clipped corners, getting brighter inward
			const step = (i: number, col: string) => {
				c.rect(i, i + 1, TEX - 2 * i, 1, col);
				c.rect(i, TEX - 2 - i, TEX - 2 * i, 1, col);
				c.rect(i + 1, i, 1, TEX - 2 * i, col);
				c.rect(TEX - 2 - i, i, 1, TEX - 2 * i, col);
			};
			step(0, K(0.3));
			step(2, W(0.25));
			step(4, W(0.4));
			c.rect(6, 6, 4, 4, W(0.6));
			c.rect(6, 6, 4, 1, W(0.9));
		},
	},
	piece_crystal_sun: {
		shape: SHAPE_ROUND,
		draw: (c) => {
			// radiant cut: rays from a blazing center
			for (let a = 0; a < 12; a++) {
				const ang = (a / 12) * Math.PI * 2;
				c.line(8, 8, 8 + Math.cos(ang) * 8, 8 + Math.sin(ang) * 8, a % 2 ? W(0.35) : K(0.12));
			}
			c.disc(8, 8, 3, W(0.95));
			c.ring(8, 8, 4, C("#FFD166", 0.9));
		},
	},
	piece_ruby_cut: {
		shape: SHAPE_SOFT,
		draw: (c) => {
			// brilliant cut: eight triangular facets around an octagonal table, deep shadows between
			c.where((x, y) => {
				const a = Math.atan2(y + 0.5 - 8, x + 0.5 - 8);
				return Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8) % 2 === 0;
			}, K(0.3));
			c.where((x, y) => Math.abs(x + 0.5 - 8) + Math.abs(y + 0.5 - 8) < 5.5, W(0.35));
			c.where((x, y) => Math.abs(x + 0.5 - 8) + Math.abs(y + 0.5 - 8) < 3, W(0.55));
			c.sprite(9, 3, SPARK, { "#": W(1) });
		},
	},
	piece_sapphire_cut: {
		shape: SHAPE_ROUND,
		draw: (c) => {
			// star sapphire: a domed stone with the six-ray asterism and icy rim light
			c.disc(8, 8, 8, K(0.18));
			c.ring(8, 8, 8, W(0.35));
			for (let a = 0; a < 6; a++) {
				const ang = (a / 6) * Math.PI;
				c.line(8 - Math.cos(ang) * 6, 8 - Math.sin(ang) * 6, 8 + Math.cos(ang) * 6, 8 + Math.sin(ang) * 6, W(0.7));
			}
			c.disc(8, 8, 1.5, W(1));
			c.rect(4, 3, 3, 1, C("#E0F2FE", 0.9));
		},
	},
	piece_chest_prism: {
		shape: SHAPE_SOFT,
		draw: (c) => {
			// a glass prism splitting a white beam into a rainbow fan
			c.fill(K(0.25));
			c.line(0, 7, 6, 8, W(0.95));
			c.sprite(5, 3, ["...#...", "..###..", "..###..", ".#####.", ".#####.", "#######", "#######"], { "#": W(0.55) });
			const bands = ["#FF4D4D", "#FF9F1C", "#FDE047", "#4ADE80", "#38BDF8", "#A78BFA"];
			bands.forEach((col, i) => c.line(11, 7 + i * 0.4, 15, 4 + i * 1.6, C(col)));
		},
	},
	piece_chest_relic: {
		shape: SHAPE_ROUND,
		draw: (c) => {
			// an ancient gold coin: raised rim, a stamped eye rune, a worn shine
			c.ring(8, 8, 8, C("#FEF9C3", 0.8), 1);
			c.ring(8, 8, 7, C("#78350F", 0.6), 1);
			c.ring(8, 8, 5, C("#78350F", 0.5), 1);
			c.sprite(4, 6, [".#####.", "#..#..#", ".#####."], { "#": C("#78350F", 0.9) });
			c.set(7, 7, C("#FEF9C3"));
			c.line(3, 4, 6, 2, W(0.8));
		},
	},

	// ---------------------------------------------------------------- fire and forge
	piece_lava: {
		shape: SHAPE_SOFT,
		draw: (c) => {
			// cooled crust broken into plates, molten light in the cracks
			c.fill(K(0.45));
			c.path([[0, 5], [4, 6], [7, 3], [11, 4], [15, 2]], C("#FF6A00"));
			c.path([[7, 3], [8, 9], [5, 12], [6, 15]], C("#FF6A00"));
			c.path([[8, 9], [12, 10], [15, 13]], C("#FF6A00"));
			c.set(8, 9, C("#FFE066"));
			c.set(4, 6, C("#FFE066"));
			c.set(12, 10, C("#FFE066"));
		},
	},
	piece_lava_obsidian: {
		shape: SHAPE_SHARP,
		draw: (c) => {
			// volcanic glass: near black with a long glassy reflection and a thin red-hot seam
			c.fill(K(0.6));
			c.line(2, 13, 13, 2, W(0.35));
			c.line(3, 13, 13, 3, W(0.15));
			c.path([[0, 11], [5, 9], [9, 12], [15, 10]], C("#FF2A00", 0.95));
			c.set(5, 9, C("#FFB000"));
		},
	},
	piece_lava_solar: {
		shape: SHAPE_ROUND,
		draw: (c) => {
			// the surface of a sun: boiling granules and a flare arcing off the rim
			c.noise(0.35, W(0.35));
			c.noise(0.15, C("#FF6B1A", 0.6));
			c.path([[3, 13], [2, 9], [4, 5], [8, 4]], C("#FFF3B0"));
			c.disc(11, 11, 2, W(0.6));
		},
	},
	piece_lava_ember: {
		shape: SHAPE_SOFT,
		draw: (c) => {
			// charcoal with scattered live embers
			c.fill(K(0.55));
			c.noise(0.1, K(0.2));
			const r = c.rnd;
			for (let i = 0; i < 9; i++) {
				const x = Math.floor(r() * 15), y = Math.floor(r() * 15);
				c.set(x, y, C("#FF6B1A"));
				if (i % 3 === 0) c.set(x + 1, y, C("#FFD54A"));
			}
		},
	},
	piece_lava_basalt: {
		shape: SHAPE_SHARP,
		draw: (c) => {
			// basalt columns seen from above: hexagon outlines, one of them still glowing
			c.noise(0.2, K(0.15));
			const hex = (x: number, y: number, col: string) => c.sprite(x, y, [".###.", "#...#", "#...#", ".###."], { "#": col });
			hex(0, 0, K(0.55));
			hex(5, 2, K(0.55));
			hex(10, 0, K(0.55));
			hex(1, 6, K(0.55));
			hex(10, 6, K(0.55));
			hex(5, 9, C("#FF4D00"));
			c.rect(6, 10, 3, 2, C("#FFB000", 0.9));
			hex(0, 12, K(0.55));
			hex(11, 12, K(0.55));
		},
	},
	piece_lava_magma: {
		shape: SHAPE_ROUND,
		draw: (c) => {
			// boiling magma: bright bubbles swelling and popping through a darker skin
			c.fill(K(0.15));
			c.ring(5, 5, 3, C("#FFE066"));
			c.disc(5, 5, 2, W(0.3));
			c.ring(11, 9, 2.5, C("#FFE066"));
			c.ring(6, 12, 1.6, C("#FFE066"));
			c.set(12, 3, C("#FFE066"));
			c.set(13, 13, C("#FFE066"));
			c.set(4, 4, W(0.9));
		},
	},
	piece_magma_ice: {
		shape: SHAPE_LEAF,
		draw: (c) => {
			// half frozen, half molten: frost crystals meet glowing magma along a jagged line
			c.where((x, y) => x + y < 15, C("#BAE6FD", 0.55));
			c.where((x, y) => x + y >= 15, C("#7F1D1D", 0.55));
			c.path([[0, 15], [4, 11], [6, 10], [9, 6], [11, 5], [15, 0]], C("#FFB000"));
			c.sprite(2, 2, SPARK, { "#": W(1) });
			c.line(1, 7, 4, 4, W(0.85));
			c.set(11, 12, C("#FFE066"));
			c.set(13, 10, C("#FF4D00"));
		},
	},
	piece_chest_dragon: {
		shape: SHAPE_LEAF2,
		draw: (c) => {
			// overlapping scales in rows, each with a gold rim and a dark underside
			for (let row = 0; row < 5; row++) {
				const y = row * 4 - 1;
				const off = row % 2 ? 2 : -2;
				for (let x = off; x < TEX; x += 4) {
					c.sprite(x, y, [".##.", "#..#", "#..#"], { "#": C("#FBBF24", 0.9) });
					c.rect(x + 1, y + 1, 2, 2, K(0.25));
				}
			}
		},
	},

	// ---------------------------------------------------------------- circuits and tech
	piece_circuit: {
		shape: SHAPE_SHARP,
		draw: (c) => {
			// a printed board: green solder mask, copper traces at right angles, pads and vias
			c.fill(C("#064E3B", 0.35));
			const trace = C("#D5FF3F", 0.9);
			c.path([[0, 4], [5, 4], [5, 9], [10, 9]], trace);
			c.path([[15, 2], [12, 2], [12, 13], [15, 13]], trace);
			c.path([[3, 15], [3, 12], [8, 12]], trace);
			c.rect(9, 8, 3, 3, C("#FFE066"));
			c.rect(7, 11, 3, 3, C("#FFE066"));
			c.ring(4.5, 4.5, 1.5, W(0.9));
			c.ring(12.5, 2.5, 1.5, W(0.9));
		},
	},
	piece_circuit_matrix: {
		shape: SHAPE_SHARP,
		draw: (c) => {
			// falling code: columns of bright glyph pixels fading up their trail
			c.fill(K(0.55));
			const r = c.rnd;
			for (let x = 1; x < TEX; x += 3) {
				const head = Math.floor(r() * TEX);
				for (let k = 0; k < 7; k++) {
					const y = head - k;
					if (y < 0) break;
					if (r() < 0.8) c.set(x, y, k === 0 ? W(1) : C("#00FF9D", 1 - k * 0.13));
					if (k % 2 === 0 && r() < 0.5) c.set(x + 1, y, C("#00FF9D", 0.6 - k * 0.07));
				}
			}
		},
	},
	piece_circuit_neon: {
		shape: SHAPE_SOFT,
		draw: (c) => {
			// a bent neon tube: two glowing loops, cyan and magenta, on a dark mount
			c.fill(K(0.5));
			c.path([[2, 3], [13, 3], [13, 8], [6, 8], [6, 13]], C("#00D4FF"));
			c.path([[2, 3], [2, 12]], C("#00D4FF"));
			c.path([[9, 13], [13, 13], [13, 11]], C("#FF2BD6"));
			c.rect(1, 12, 3, 2, W(0.5));
			c.rect(5, 13, 3, 2, W(0.5));
		},
	},
	piece_circuit_plasma: {
		shape: SHAPE_LEAF2,
		draw: (c) => {
			// plasma arc: a forked lightning bolt jumping between two electrodes
			c.fill(K(0.4));
			c.rect(0, 6, 2, 4, W(0.7));
			c.rect(14, 6, 2, 4, W(0.7));
			c.path([[2, 8], [5, 5], [7, 9], [10, 6], [12, 9], [14, 8]], W(1));
			c.path([[5, 5], [6, 2]], C("#D5FF3F"));
			c.path([[10, 6], [11, 12]], C("#D5FF3F"));
			c.noise(0.06, C("#00D4FF", 0.9));
		},
	},
	piece_circuit_terminal: {
		shape: SHAPE_SHARP,
		draw: (c) => {
			// an old terminal: dark glass, scanlines and a prompt with a blinking cursor
			c.fill(K(0.6));
			for (let y = 1; y < TEX; y += 2) c.rect(0, y, TEX, 1, K(0.25));
			c.sprite(2, 4, ["#..", ".#.", "#.."], { "#": C("#06D6A0") });
			c.rect(6, 6, 3, 1, C("#06D6A0"));
			c.rect(10, 4, 2, 3, C("#00FF9D"));
			c.rect(2, 10, 9, 1, C("#06D6A0", 0.5));
			c.rect(2, 12, 6, 1, C("#06D6A0", 0.5));
		},
	},
	piece_circuit_candy: {
		shape: SHAPE_SOFT,
		draw: (c) => {
			// a microchip in pastel: a dark body with pins along both sides and a notch
			c.rect(4, 3, 8, 10, K(0.45));
			for (let y = 4; y < 13; y += 2) {
				c.rect(1, y, 3, 1, W(0.85));
				c.rect(12, y, 3, 1, W(0.85));
			}
			c.disc(8, 3.5, 1.2, W(0.6));
			c.rect(6, 7, 4, 1, C("#FF2BD6"));
			c.rect(6, 9, 3, 1, C("#A2D2FF"));
		},
	},
	piece_copper_wire: {
		shape: SHAPE_ROUND,
		draw: (c) => {
			// a coil: tight copper windings with highlights and green-teal patina spots
			for (let x = -16; x < TEX; x += 3) {
				c.line(x, 15, x + 15, 0, C("#7C2D12", 0.6));
				c.line(x + 1, 15, x + 16, 0, C("#FDBA74", 0.8));
			}
			c.disc(3, 11, 1.6, C("#14B8A6", 0.9));
			c.disc(12, 4, 1.2, C("#14B8A6", 0.9));
		},
	},
	piece_laser_grid: {
		shape: SHAPE_SHARP,
		draw: (c) => {
			// a neon floor grid running into the horizon, a red laser cutting across
			c.fill(K(0.55));
			c.rect(0, 5, TEX, 1, C("#22D3EE"));
			for (const y of [7, 10, 14]) c.rect(0, y, TEX, 1, C("#22D3EE", 0.75));
			for (let i = -3; i <= 3; i++) c.line(8 + i * 1.2, 5, 8 + i * 5, 15, C("#22D3EE", 0.75));
			c.line(0, 2, 15, 4, C("#EF4444"));
			c.line(0, 1, 15, 3, C("#EF4444", 0.4));
		},
	},
	piece_night_market: {
		shape: SHAPE_ROUND,
		draw: (c) => {
			// a paper lantern: ribbed glowing body, dark cap and tassel
			c.fill(K(0.45));
			c.rect(6, 1, 4, 2, K(0.6));
			c.sprite(3, 3, [".########.", "##########", "##########", "##########", "##########", "##########", "##########", ".########."], {
				"#": C("#FACC15", 0.9),
			});
			for (let x = 4; x < 13; x += 2) c.rect(x, 4, 1, 7, C("#BE123C", 0.6));
			c.rect(6, 11, 4, 1, K(0.6));
			c.rect(7, 12, 2, 3, C("#BE123C"));
		},
	},
	piece_arcade_gum: {
		shape: SHAPE_ROUND,
		draw: (c) => {
			// bubble gum blown into a big shiny bubble
			c.disc(8, 8, 6.5, W(0.25));
			c.ring(8, 8, 6.5, W(0.55));
			c.rect(4, 4, 2, 2, W(0.95));
			c.set(6, 3, W(0.8));
			c.set(11, 12, C("#22D3EE"));
			c.set(12, 11, C("#22D3EE"));
		},
	},

	// ---------------------------------------------------------------- space and sky
	piece_cosmic_ore: {
		shape: SHAPE_LEAF,
		draw: (c) => {
			// a meteorite: pitted metal with craters (dark bowl, lit rim) and cold shine
			c.noise(0.2, K(0.25));
			c.noise(0.1, W(0.3));
			const crater = (x: number, y: number, r: number) => {
				c.disc(x, y, r, K(0.45));
				c.ring(x, y, r, W(0.5));
			};
			crater(5, 5, 3);
			crater(11, 10, 2.5);
			crater(4, 12, 1.5);
			c.line(9, 2, 13, 2, C("#C4B5FD"));
		},
	},
	piece_chest_cosmic: {
		shape: SHAPE_ROUND,
		draw: (c) => {
			// deep space: a spiral galaxy with a bright core and scattered stars
			c.fill(K(0.5));
			for (let t = 0; t < 30; t++) {
				const a = t * 0.42;
				const r = t * 0.23;
				c.set(8 + Math.cos(a) * r, 8 + Math.sin(a) * r, C("#F0ABFC", 0.9));
				c.set(8 - Math.cos(a) * r, 8 - Math.sin(a) * r, C("#A5B4FC", 0.9));
			}
			c.disc(8, 8, 1.5, W(1));
			c.noise(0.04, W(0.9));
		},
	},
	piece_void_pearl: {
		shape: SHAPE_ROUND,
		draw: (c) => {
			// a black hole: a dark void ringed by a bright pearly accretion disk
			c.fill(K(0.4));
			c.where((x, y) => {
				const dx = x + 0.5 - 8, dy = (y + 0.5 - 8) * 2.4;
				const d = Math.sqrt(dx * dx + dy * dy);
				return d < 7.5 && d > 4.5;
			}, C("#DDD6FE", 0.85));
			c.disc(8, 8, 3.2, K(0.85));
			c.ring(8, 8, 3.6, W(0.6));
			c.set(2, 2, W(0.9));
			c.set(13, 13, W(0.7));
		},
	},
	piece_moonstone: {
		shape: SHAPE_ROUND,
		draw: (c) => {
			// a crescent moon with its soft halo and two small craters
			c.disc(8, 8, 7, W(0.15));
			c.disc(7, 8, 5.5, W(0.75));
			c.disc(9.6, 6.6, 5, K(0.35));
			c.set(4, 10, K(0.3));
			c.set(6, 12, K(0.25));
			c.set(13, 3, W(0.9));
		},
	},
	piece_storm_cloud: {
		shape: SHAPE_SOFT,
		draw: (c) => {
			// a heavy cloud with a lightning strike under it
			c.disc(5, 6, 3.5, W(0.55));
			c.disc(10, 5, 4, W(0.6));
			c.rect(2, 6, 12, 3, W(0.55));
			c.rect(2, 8, 12, 1, K(0.25));
			c.path([[9, 9], [7, 12], [9, 12], [7, 15]], C("#FDE047"));
			c.noise(0.05, C("#BAE6FD", 0.8), (x, y) => y > 10);
		},
	},
	piece_chest_aurora: {
		shape: SHAPE_ROUND,
		draw: (c) => {
			// a glowing core with aurora ribbons wrapped around it
			c.fill(K(0.3));
			for (let x = 0; x < TEX; x++) {
				c.set(x, 4 + Math.round(Math.sin(x / 2) * 1.5), C("#5EEAD4"));
				c.set(x, 11 + Math.round(Math.sin(x / 2 + 1.5) * 1.5), C("#A78BFA"));
			}
			c.disc(8, 8, 2.5, W(0.95));
			c.ring(8, 8, 3.5, C("#5EEAD4", 0.6));
		},
	},
	piece_aurora_glass: {
		shape: SHAPE_SOFT,
		draw: (c) => {
			// aurora curtains: vertical light folds rippling across glass
			for (let x = 0; x < TEX; x++) {
				const top = 2 + Math.round(Math.sin(x / 1.8) * 2);
				c.rect(x, top, 1, 9 - Math.abs(Math.round(Math.sin(x / 3) * 3)), W(x % 3 === 0 ? 0.5 : 0.25));
			}
			c.noise(0.04, W(0.9), (x, y) => y > 12);
		},
	},

	// ---------------------------------------------------------------- toxic and dark
	piece_radioactive: {
		shape: SHAPE_SHARP,
		draw: (c) => {
			// a warning plate: black and yellow hazard stripes around a glowing trefoil
			c.where((x, y) => (x < 3 || y < 3 || x > 12 || y > 12) && Math.floor((x + y) / 2) % 2 === 0, C("#FACC15"));
			c.where((x, y) => (x < 3 || y < 3 || x > 12 || y > 12) && Math.floor((x + y) / 2) % 2 === 1, K(0.8));
			c.rect(3, 3, 10, 10, K(0.65));
			c.where((x, y) => {
				const dx = x + 0.5 - 8, dy = y + 0.5 - 8;
				const d = Math.sqrt(dx * dx + dy * dy);
				const a = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
				const blade = ((a % 120) + 120) % 120 < 60;
				return (d >= 1.8 && d <= 4.6 && blade) || d < 1.2;
			}, C("#D9F99D"));
		},
	},
	piece_chest_toxic: {
		shape: SHAPE_LEAF,
		draw: (c) => {
			// toxic ooze: glowing slime dripping from the top, bubbles rising in it
			c.fill(K(0.3));
			c.where((x, y) => y < 3 + ((x * 5) % 4) + (x === 4 || x === 11 ? 5 : 0), C("#BEF264", 0.95));
			c.ring(5, 11, 2, C("#ECFCCB"));
			c.ring(11, 13, 1.5, C("#ECFCCB"));
			c.set(9, 9, C("#ECFCCB"));
			c.rect(2, 1, 2, 1, W(0.8));
		},
	},
	piece_lime_shadow: {
		shape: SHAPE_LEAF2,
		draw: (c) => {
			// a lime-lit target in the dark: HUD corner brackets and a crosshair
			c.fill(K(0.55));
			const col = C("#BEF264");
			c.path([[1, 5], [1, 1], [5, 1]], col);
			c.path([[10, 1], [14, 1], [14, 5]], col);
			c.path([[1, 10], [1, 14], [5, 14]], col);
			c.path([[10, 14], [14, 14], [14, 10]], col);
			c.rect(7, 4, 1, 8, C("#BEF264", 0.6));
			c.rect(4, 7, 8, 1, C("#BEF264", 0.6));
			c.rect(7, 7, 1, 1, W(1));
		},
	},
	piece_ghost_ink: {
		shape: SHAPE_LEAF2,
		draw: (c) => {
			// a pale ghost drifting in washed ink
			c.where((x, y) => (x * 3 + y * 5) % 7 === 0, K(0.15));
			c.sprite(3, 2, [
				"..######..",
				".########.",
				"##########",
				"###..#..##",
				"###..#..##",
				"##########",
				"##########",
				"##########",
				"#.##..##.#",
			], { "#": W(0.75) });
			c.rect(6, 5, 1, 2, K(0.7));
			c.rect(9, 5, 1, 2, K(0.7));
		},
	},
	piece_shadow_gold: {
		shape: SHAPE_SHARP,
		draw: (c) => {
			// black lacquer with gold filigree in the corners and a gold inlay line
			c.fill(K(0.55));
			const g = C("#FACC15");
			c.sprite(0, 0, ["####.", "#..#.", "#.##.", "###..", "....."], { "#": g });
			c.sprite(11, 11, [".....", "..###", ".##.#", ".#..#", ".####"], { "#": g });
			c.line(4, 11, 11, 4, C("#FACC15", 0.6));
			c.set(7, 8, W(1));
		},
	},
	piece_royal_velvet: {
		shape: SHAPE_SOFT,
		draw: (c) => {
			// a tufted velvet cushion: diamond quilting and gold buttons at the folds
			c.where((x, y) => (x + y) % 8 === 0 || (x - y + 16) % 8 === 0, K(0.35));
			c.where((x, y) => (x + y) % 8 === 1 || (x - y + 16) % 8 === 1, W(0.15));
			for (const [x, y] of [[4, 4], [12, 4], [8, 8], [4, 12], [12, 12], [0, 8], [8, 0]]) c.rect(x - 1, y - 1, 2, 2, C("#FDE047"));
		},
	},

	// ---------------------------------------------------------------- nature
	piece_forest_mushroom: {
		shape: SHAPE_LEAF,
		draw: (c) => {
			// a toadstool: red spotted cap over a pale stem, moss at the foot
			c.sprite(1, 1, [
				"....######....",
				"..##########..",
				".############.",
				"##############",
				"##############",
			], { "#": C("#DC2626", 0.95) });
			c.rect(3, 2, 2, 2, W(0.95));
			c.rect(9, 3, 2, 1, W(0.95));
			c.set(12, 5, W(0.95));
			c.rect(6, 6, 4, 7, C("#FEF3C7", 0.95));
			c.rect(3, 13, 10, 3, C("#365314", 0.9));
		},
	},
	piece_jade_tile: {
		shape: SHAPE_SHARP,
		draw: (c) => {
			// carved jade: a sunken square with a meander key cut into it
			c.bevel(2, W(0.3), K(0.35));
			c.rect(2, 2, 12, 12, K(0.12));
			c.path([[4, 11], [4, 4], [11, 4], [11, 11], [7, 11], [7, 7], [9, 7], [9, 9]], C("#064E3B", 0.85));
			c.path([[5, 12], [5, 5], [12, 5]], C("#A7F3D0", 0.6));
		},
	},
	piece_topaz_tile: {
		shape: SHAPE_SOFT,
		draw: (c) => {
			// a polished tile: deep bevel and one sweeping glossy reflection band
			c.bevel(3, W(0.35), K(0.3));
			c.line(3, 10, 10, 3, W(0.55));
			c.line(4, 10, 10, 4, W(0.55));
			c.line(5, 12, 12, 5, W(0.2));
		},
	},
	piece_desert_clay: {
		shape: SHAPE_SOFT,
		draw: (c) => {
			// desert at dusk: wavy sand strata under a low sun and a lone cactus
			c.disc(11, 5, 2.5, C("#FFE6B0", 0.9));
			for (let x = 0; x < TEX; x++) {
				c.rect(x, 9 + Math.round(Math.sin(x / 2.5) * 1), 1, 2, K(0.2));
				c.rect(x, 12 + Math.round(Math.sin(x / 2.5 + 2) * 1), 1, 1, W(0.25));
			}
			c.sprite(2, 4, [".#..", ".#.#", "####", ".#..", ".#.."], { "#": C("#3F6212", 0.95) });
		},
	},
	piece_snow_mint: {
		shape: SHAPE_SOFT,
		draw: (c) => {
			// snow piled on top and a six-armed snowflake
			c.where((x, y) => y < 3 + ((x * 3) % 2), W(0.95));
			for (let a = 0; a < 6; a++) {
				const ang = (a / 6) * Math.PI * 2;
				c.line(8, 9.5, 8 + Math.cos(ang) * 4.5, 9.5 + Math.sin(ang) * 4.5, W(0.9));
			}
			c.set(8, 9, W(1));
		},
	},
	piece_ocean_shell: {
		shape: SHAPE_LEAF2,
		draw: (c) => {
			// a scallop shell: ridges fanning out from the hinge at the bottom
			c.where((x, y) => {
				const dx = x + 0.5 - 8, dy = y + 0.5 - 15;
				return Math.sqrt(dx * dx + dy * dy) < 13;
			}, W(0.12));
			for (let a = 0; a < 7; a++) {
				const ang = Math.PI + (a + 0.5) * (Math.PI / 7);
				c.line(8, 15, 8 + Math.cos(ang) * 12, 15 + Math.sin(ang) * 12, a % 2 ? W(0.55) : K(0.25));
			}
			c.rect(6, 14, 4, 2, C("#FB7185", 0.9));
		},
	},
	piece_pearl_shell: {
		shape: SHAPE_ROUND,
		draw: (c) => {
			// a pearl resting in an open shell: lustrous sphere with a pink sheen
			c.where((x, y) => y > 9, K(0.2));
			c.disc(8, 8, 4.5, C("#FFF7FB", 0.9));
			c.disc(9, 9, 3, C("#FBCFE8", 0.6));
			c.rect(6, 5, 2, 2, W(1));
			c.ring(8, 8, 4.5, C("#E0F2FE", 0.8));
		},
	},
	piece_neon_fruit: {
		shape: SHAPE_ROUND,
		draw: (c) => {
			// a citrus slice: rind, pith ring and juicy segments
			c.ring(8, 8, 8, C("#FACC15", 0.95), 1.4);
			c.ring(8, 8, 6.6, W(0.8), 1);
			for (let a = 0; a < 8; a++) {
				const ang = (a / 8) * Math.PI * 2;
				c.line(8, 8, 8 + Math.cos(ang) * 5.5, 8 + Math.sin(ang) * 5.5, W(0.7));
			}
			c.set(8, 8, W(1));
		},
	},
	piece_peach_soda: {
		shape: SHAPE_ROUND,
		draw: (c) => {
			// fizz: bubbles of every size rising, a foam line on top
			c.where((x, y) => y < 2 + ((x * 7) % 2), W(0.85));
			c.ring(4, 11, 2.5, W(0.8));
			c.ring(11, 8, 2, W(0.8));
			c.ring(8, 13, 1.5, W(0.75));
			c.set(6, 5, W(0.9));
			c.set(12, 4, W(0.9));
			c.set(3, 6, W(0.7));
			c.set(10, 12, W(0.7));
			c.set(3, 10, W(1));
		},
	},
	piece_candy_pop: {
		shape: SHAPE_ROUND,
		draw: (c) => {
			// a peppermint swirl candy with a glossy shine
			c.where((x, y) => {
				const a = Math.atan2(y + 0.5 - 8, x + 0.5 - 8) + Math.sqrt((x + 0.5 - 8) ** 2 + (y + 0.5 - 8) ** 2) * 0.35;
				return Math.floor(((a + Math.PI * 4) / Math.PI) * 3) % 2 === 0;
			}, W(0.75));
			c.disc(8, 8, 1.5, W(0.9));
			c.rect(4, 3, 3, 1, W(1));
		},
	},
	piece_paper_cut: {
		shape: SHAPE_SHARP,
		draw: (c) => {
			// a sheet of paper: fibres, an inked outline and the top corner folded over
			c.noise(0.06, K(0.12));
			c.frame(1, C("#111827", 0.85));
			c.where((x, y) => x - y > 9, K(0.65));
			c.where((x, y) => x - y === 9 || (x - y > 9 && y === 0), C("#111827"));
			c.where((x, y) => x - y < 9 && x - y > 6 && y < 6, W(0.5));
			c.sprite(11, 1, ["####", ".###", "..##", "...#"], { "#": W(0.95) });
		},
	},
	piece_ink_stamp: {
		shape: SHAPE_SOFT,
		draw: (c) => {
			// a rubber stamp mark: a rough inked ring with a star, splatters around it
			c.ring(8, 8, 7.5, C("#111827", 0.55), 1);
			c.ring(8, 8, 6.5, C("#EF4444", 0.95), 1.5);
			c.ring(8, 8, 5, C("#111827", 0.55), 1);
			c.sprite(6, 6, STAR4, { "#": C("#EF4444", 0.95) });
			c.set(8, 8, C("#111827", 0.6));
			c.noise(0.05, C("#111827", 0.7));
			c.set(1, 14, C("#EF4444"));
			c.set(14, 2, C("#EF4444"));
		},
	},
	piece_monochrome: {
		shape: SHAPE_SHARP,
		draw: (c) => {
			// halftone print: dots growing from light to dark across the block
			for (let y = 1; y < TEX; y += 3)
				for (let x = 1; x < TEX; x += 3) {
					const k = (x + y) / 30;
					c.rect(x, y, k > 0.6 ? 2 : 1, k > 0.35 ? 2 : 1, K(0.75));
				}
			c.rect(0, 0, 5, 1, W(0.9));
			c.rect(0, 0, 1, 5, W(0.9));
		},
	},
};

export type TextureLayer = { color: string; d: string };

const CACHE = new Map<string, TextureLayer[]>();

/** The skin's picture as one path per color (horizontal runs of pixels), or null when the skin has none. */
export function textureOf(pieceSkinId: string): TextureLayer[] | null {
	const recipe = SKIN_TEXTURES[pieceSkinId];
	if (!recipe) return null;
	const cached = CACHE.get(pieceSkinId);
	if (cached) return cached;
	const c = paint(pieceSkinId, recipe);
	const byColor = new Map<string, string>();
	for (let y = 0; y < TEX; y++) {
		let x = 0;
		while (x < TEX) {
			const col = c.px[y * TEX + x];
			if (!col) {
				x++;
				continue;
			}
			let run = 1;
			while (x + run < TEX && c.px[y * TEX + x + run] === col) run++;
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
	const recipe = SKIN_TEXTURES[pieceSkinId];
	if (!recipe) return null;
	const c = paint(pieceSkinId, recipe);
	return c.px.map((p) => p ?? "").join("|");
}

/** The block shape the skin's theme asks for, or 0 to keep its family's own. */
export function textureShape(pieceSkinId: string): number {
	return SKIN_TEXTURES[pieceSkinId]?.shape ?? 0;
}
