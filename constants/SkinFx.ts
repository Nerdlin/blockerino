import { SHOP_ITEMS } from "./Shop";

// How a piece skin looks and moves beyond its colors: the block's surface, how a placed block appears and how a
// cleared block goes. Runs in worklets too (plain values only).
//
// Every skin has its own style: a kind (the family: how it appears and clears, and its signature surface), a
// pattern on the block and a block shape. getSkinKindId packs the three into one number (kind | pattern << 4 |
// shape << 8); the worklet functions below unpack it. No two skins share a pattern and shape (SkinFx.test.ts).

export type SkinKind = "bevel" | "stone" | "crystal" | "lava" | "neon" | "liquid" | "pixel" | "glass" | "metal" | "wood" | "candy" | "orb";

// numeric ids for worklets (comparing numbers is cheapest on the UI thread)
export const SKIN_BEVEL = 0;
export const SKIN_STONE = 1;
export const SKIN_CRYSTAL = 2;
export const SKIN_LAVA = 3;
export const SKIN_NEON = 4;
export const SKIN_LIQUID = 5;
export const SKIN_PIXEL = 6;
export const SKIN_GLASS = 7;
export const SKIN_METAL = 8;
export const SKIN_WOOD = 9;
export const SKIN_CANDY = 10;
export const SKIN_ORB = 11;

const KIND_IDS: Record<SkinKind, number> = { bevel: SKIN_BEVEL, stone: SKIN_STONE, crystal: SKIN_CRYSTAL, lava: SKIN_LAVA, neon: SKIN_NEON, liquid: SKIN_LIQUID,
	pixel: SKIN_PIXEL, glass: SKIN_GLASS, metal: SKIN_METAL, wood: SKIN_WOOD, candy: SKIN_CANDY, orb: SKIN_ORB };

const EXTRA: Record<string, SkinKind> = {
	piece_desert_clay: "wood",
	piece_jade_tile: "stone",
	piece_forest_mushroom: "wood",
	piece_topaz_tile: "wood",
	piece_paper_cut: "pixel",
	piece_ink_stamp: "pixel",
	piece_ruby_cut: "crystal",
	piece_sapphire_cut: "crystal",
	piece_cosmic_ore: "orb",
	piece_shadow_gold: "metal",
	piece_snow_mint: "glass",
	piece_magma_ice: "lava",
	piece_lime_shadow: "lava",
	piece_laser_grid: "neon",
	piece_neon_fruit: "candy",
	piece_radioactive: "neon",
	piece_night_market: "neon",
	piece_copper_wire: "metal",
	piece_ghost_ink: "neon",
	piece_aurora_glass: "glass",
	piece_pearl_shell: "orb",
	piece_void_pearl: "orb",
	piece_moonstone: "liquid",
	piece_ocean_shell: "liquid",
	piece_candy_pop: "candy",
	piece_peach_soda: "candy",
	piece_arcade_gum: "pixel",
	piece_storm_cloud: "glass",
	piece_royal_velvet: "liquid",
	piece_chest_aurora: "orb",
	piece_chest_cosmic: "crystal",
	piece_chest_toxic: "neon",
	piece_chest_dragon: "lava",
	piece_chest_prism: "crystal",
	piece_chest_relic: "crystal",
	piece_circuit_candy: "candy",
	piece_monochrome: "metal",
	piece_circuit_terminal: "pixel",
};

export function getSkinKind(pieceSkinId: string = "piece_classic"): SkinKind {
	if (EXTRA[pieceSkinId]) return EXTRA[pieceSkinId];
	if (pieceSkinId.startsWith("piece_minecraft")) return "stone";
	if (pieceSkinId.startsWith("piece_crystal")) return "crystal";
	if (pieceSkinId.startsWith("piece_lava")) return "lava";
	if (pieceSkinId.startsWith("piece_circuit")) return "neon";
	return "bevel";
}

// Patterns: 0 is the kind's own surface; the rest are drawn by patternStyle below.
export const PATTERN_KIND = 0;
const P_DOT = 1, P_RING = 2, P_DIAMOND = 3, P_FRAME = 4, P_HBAND = 5, P_VBAND = 6, P_DIAG = 7, P_CORNER = 8,
	P_SHINE = 9, P_GRAIN = 10, P_RAILS = 11, P_NOTCH = 12, P_HOLLOW = 13, P_BASE = 14, P_HALF = 15;
// Shapes: 0 is the kind's own; 1 sharp, 2 soft corners, 3 round, 4 leaf (two round corners), 5 the other leaf.
const S_SHARP = 1, S_SOFT = 2, S_ROUND = 3, S_LEAF = 4, S_LEAF2 = 5;

// What suits each family first: a stone gets frames and grain before dots, a crystal gets facets before stripes.
const PATTERN_ORDER: Record<SkinKind, number[]> = {
	bevel: [P_CORNER, P_FRAME, P_DOT, P_HBAND, P_VBAND, P_NOTCH, P_HALF, P_DIAG, P_RING, P_RAILS, P_SHINE, P_BASE, P_GRAIN, P_DIAMOND, P_HOLLOW],
	stone: [PATTERN_KIND, P_FRAME, P_GRAIN, P_NOTCH, P_BASE, P_RAILS, P_CORNER, P_HALF, P_DOT, P_HBAND, P_VBAND, P_DIAG, P_SHINE, P_RING, P_DIAMOND, P_HOLLOW],
	crystal: [PATTERN_KIND, P_DIAMOND, P_DIAG, P_SHINE, P_RING, P_CORNER, P_HALF, P_DOT, P_FRAME, P_VBAND, P_HBAND, P_NOTCH, P_RAILS, P_BASE, P_GRAIN, P_HOLLOW],
	lava: [PATTERN_KIND, P_DOT, P_BASE, P_RING, P_HBAND, P_NOTCH, P_HALF, P_FRAME, P_DIAG, P_VBAND, P_CORNER, P_SHINE, P_RAILS, P_GRAIN, P_DIAMOND, P_HOLLOW],
	neon: [PATTERN_KIND, P_HOLLOW, P_FRAME, P_RAILS, P_RING, P_DIAMOND, P_VBAND, P_HBAND, P_DOT, P_CORNER, P_DIAG, P_NOTCH, P_HALF, P_SHINE, P_BASE, P_GRAIN],
	liquid: [PATTERN_KIND, P_SHINE, P_DOT, P_RING, P_HALF, P_BASE, P_DIAG, P_CORNER, P_FRAME, P_HBAND, P_VBAND, P_NOTCH, P_RAILS, P_GRAIN, P_DIAMOND, P_HOLLOW],
	pixel: [PATTERN_KIND, P_NOTCH, P_FRAME, P_HALF, P_CORNER, P_BASE, P_HBAND, P_VBAND, P_DOT, P_RAILS, P_DIAG, P_SHINE, P_GRAIN, P_RING, P_DIAMOND, P_HOLLOW],
	glass: [PATTERN_KIND, P_SHINE, P_DIAG, P_HALF, P_FRAME, P_RING, P_CORNER, P_DOT, P_HBAND, P_VBAND, P_NOTCH, P_RAILS, P_BASE, P_GRAIN, P_DIAMOND, P_HOLLOW],
	metal: [PATTERN_KIND, P_RAILS, P_HBAND, P_NOTCH, P_FRAME, P_BASE, P_DOT, P_CORNER, P_HALF, P_VBAND, P_DIAG, P_RING, P_GRAIN, P_SHINE, P_DIAMOND, P_HOLLOW],
	wood: [PATTERN_KIND, P_VBAND, P_FRAME, P_NOTCH, P_BASE, P_HALF, P_RAILS, P_HBAND, P_CORNER, P_DOT, P_DIAG, P_SHINE, P_RING, P_GRAIN, P_DIAMOND, P_HOLLOW],
	candy: [PATTERN_KIND, P_DOT, P_RING, P_HBAND, P_VBAND, P_HALF, P_CORNER, P_SHINE, P_FRAME, P_NOTCH, P_RAILS, P_BASE, P_GRAIN, P_DIAMOND, P_HOLLOW, P_DIAG],
	orb: [PATTERN_KIND, P_DOT, P_SHINE, P_DIAMOND, P_HALF, P_BASE, P_CORNER, P_FRAME, P_HBAND, P_VBAND, P_DIAG, P_NOTCH, P_RAILS, P_GRAIN, P_HOLLOW],
};
const SHAPE_ORDER: Record<SkinKind, number[]> = {
	bevel: [0, S_SOFT, S_SHARP, S_LEAF, S_LEAF2, S_ROUND],
	stone: [0, S_SHARP, S_SOFT, S_LEAF2, S_LEAF, S_ROUND],
	crystal: [0, S_SOFT, S_LEAF, S_LEAF2, S_SHARP, S_ROUND],
	lava: [0, S_SOFT, S_ROUND, S_LEAF, S_SHARP, S_LEAF2],
	neon: [0, S_SHARP, S_SOFT, S_LEAF2, S_LEAF, S_ROUND],
	liquid: [0, S_ROUND, S_LEAF, S_SOFT, S_LEAF2, S_SHARP],
	pixel: [0, S_SHARP, S_SOFT, S_LEAF, S_LEAF2, S_ROUND],
	glass: [0, S_SOFT, S_LEAF2, S_SHARP, S_LEAF, S_ROUND],
	metal: [0, S_SOFT, S_SHARP, S_LEAF, S_LEAF2, S_ROUND],
	wood: [0, S_SOFT, S_SHARP, S_LEAF2, S_LEAF, S_ROUND],
	candy: [0, S_ROUND, S_LEAF, S_SOFT, S_LEAF2, S_SHARP],
	orb: [0, S_ROUND, S_SOFT, S_LEAF, S_LEAF2, S_SHARP],
};

let styleCodes: Map<string, number> | null = null;

/** Each piece skin of the catalog, in catalog order, takes the first pattern and shape that no skin before it has. */
function buildStyleCodes(): Map<string, number> {
	const codes = new Map<string, number>([["piece_classic", 0]]);
	const used = new Set<string>(["k0:0"]);
	for (const item of SHOP_ITEMS) {
		if (item.category !== "piece_skin" || codes.has(item.id)) continue;
		const kindName = getSkinKind(item.id);
		const kind = KIND_IDS[kindName];
		let code = kind;
		// walk the pairs so that the pattern and the shape both change from one skin of a family to the next
		// (every pair is reached once: the shape step of 5 is coprime with the 6 shapes)
		const patterns = PATTERN_ORDER[kindName];
		const shapes = SHAPE_ORDER[kindName];
		for (let k = 0; k < patterns.length * shapes.length; k++) {
			const pattern = patterns[k % patterns.length];
			const shape = shapes[(k + Math.floor(k / patterns.length)) % shapes.length];
			// a kind's own surface looks different in every kind; a drawn pattern looks the same in any kind
			const key = `${pattern === PATTERN_KIND ? `k${kind}` : `p${pattern}`}:${shape}`;
			if (used.has(key)) continue;
			used.add(key);
			code = kind | (pattern << 4) | (shape << 8);
			break;
		}
		codes.set(item.id, code);
	}
	return codes;
}

/** The skin's style packed in one number (kind, pattern, shape); 0 is the plain classic block. */
export function getSkinKindId(pieceSkinId: string = "piece_classic"): number {
	if (!styleCodes) styleCodes = buildStyleCodes();
	return styleCodes.get(pieceSkinId) ?? KIND_IDS[getSkinKind(pieceSkinId)];
}

/** The family part of a style code. */
export function kindOf(code: number): number {
	"worklet";
	return code & 15;
}

/** A drawn pattern over the block; null for none. */
function patternStyle(pattern: number, size: number): Record<string, unknown> | null {
	"worklet";
	const third = Math.round(size * 0.3);
	const line = Math.max(1, Math.round(size * 0.07));
	if (pattern === P_DOT) {
		const d = Math.max(3, Math.round(size * 0.26));
		return { position: "absolute", left: (size - d) / 2 - line, top: (size - d) / 2 - line, width: d, height: d, borderRadius: d, backgroundColor: "rgba(255,255,255,0.55)" };
	}
	if (pattern === P_RING) {
		const d = Math.round(size * 0.44);
		return { position: "absolute", left: (size - d) / 2 - line, top: (size - d) / 2 - line, width: d, height: d, borderRadius: d, borderWidth: line + 1, borderColor: "rgba(255,255,255,0.6)" };
	}
	if (pattern === P_DIAMOND) {
		const d = Math.round(size * 0.34);
		return { position: "absolute", left: (size - d) / 2 - line, top: (size - d) / 2 - line, width: d, height: d, borderWidth: line, borderColor: "rgba(255,255,255,0.75)", transform: [{ rotate: "45deg" }] };
	}
	if (pattern === P_FRAME) {
		const inset = Math.round(size * 0.14);
		return { position: "absolute", left: inset, top: inset, right: inset, bottom: inset, borderWidth: line, borderColor: "rgba(0,0,0,0.3)" };
	}
	if (pattern === P_HBAND) {
		return { position: "absolute", left: 0, right: 0, top: third, height: Math.round(size * 0.18), backgroundColor: "rgba(255,255,255,0.3)" };
	}
	if (pattern === P_VBAND) {
		return { position: "absolute", top: 0, bottom: 0, left: third, width: Math.round(size * 0.18), backgroundColor: "rgba(255,255,255,0.28)" };
	}
	if (pattern === P_DIAG) {
		const band = Math.max(3, Math.round(size * 0.16));
		return { position: "absolute", left: Math.round(size * 0.35), top: -4, width: band, height: size + 4, backgroundColor: "rgba(255,255,255,0.3)", transform: [{ rotate: "45deg" }] };
	}
	if (pattern === P_CORNER) {
		const c = Math.max(3, Math.round(size * 0.22));
		return { position: "absolute", left: 0, top: 0, width: c, height: c, backgroundColor: "rgba(255,255,255,0.5)" };
	}
	if (pattern === P_SHINE) {
		return { position: "absolute", left: Math.round(size * 0.1), top: Math.round(size * 0.06), width: Math.round(size * 0.5), height: Math.round(size * 0.16), borderRadius: size, backgroundColor: "rgba(255,255,255,0.55)" };
	}
	if (pattern === P_GRAIN) {
		return { position: "absolute", left: 0, right: 0, top: Math.round(size * 0.18), height: Math.round(size * 0.4), borderTopWidth: line, borderBottomWidth: line, borderColor: "rgba(0,0,0,0.25)" };
	}
	if (pattern === P_RAILS) {
		return { position: "absolute", top: 0, bottom: 0, left: Math.round(size * 0.16), width: Math.round(size * 0.4), borderLeftWidth: line, borderRightWidth: line, borderColor: "rgba(255,255,255,0.4)" };
	}
	if (pattern === P_NOTCH) {
		const c = Math.max(3, Math.round(size * 0.24));
		return { position: "absolute", left: size - c - Math.round(size * 0.3), top: size - c - Math.round(size * 0.3), width: c, height: c, backgroundColor: "rgba(0,0,0,0.35)" };
	}
	if (pattern === P_HOLLOW) {
		const inset = Math.round(size * 0.24);
		return { position: "absolute", left: inset, top: inset, right: inset, bottom: inset, backgroundColor: "rgba(0,0,0,0.55)" };
	}
	if (pattern === P_BASE) {
		return { position: "absolute", left: 0, right: 0, top: Math.round(size * 0.42), height: Math.round(size * 0.3), backgroundColor: "rgba(0,0,0,0.22)" };
	}
	if (pattern === P_HALF) {
		return { position: "absolute", top: 0, bottom: 0, left: 0, width: Math.round(size * 0.34), backgroundColor: "rgba(255,255,255,0.2)" };
	}
	return null;
}

/** The block's corners for a shape other than the kind's own. */
function shapeStyle(shape: number, size: number): Record<string, unknown> | null {
	"worklet";
	if (shape === S_SHARP) return { borderRadius: 0 };
	if (shape === S_SOFT) return { borderRadius: Math.round(size * 0.2) };
	if (shape === S_ROUND) return { borderRadius: Math.round(size * 0.5) };
	if (shape === S_LEAF) {
		const r = Math.round(size * 0.45);
		return { borderRadius: 0, borderTopLeftRadius: r, borderBottomRightRadius: r };
	}
	if (shape === S_LEAF2) {
		const r = Math.round(size * 0.45);
		return { borderRadius: 0, borderTopRightRadius: r, borderBottomLeftRadius: r };
	}
	return null;
}

/**
 * The extra layer drawn over a filled block (its surface): returns a style for one absolutely placed view inside
 * the block, or null for the plain bevel. `size` is the block size. Insets count from the inner edge of the block (inside
 * its border), so the layer must sit inside the block or inside a frame with the same border width (BlockGrid). The
 * layer does not depend on the block color, so one style fits every block of a skin.
 */
export function skinDecorStyle(code: number, size: number, _hex?: string): Record<string, unknown> | null {
	"worklet";
	const pattern = (code >> 4) & 15;
	if (pattern !== PATTERN_KIND) return patternStyle(pattern, size);
	const kind = code & 15;
	const inset = Math.max(2, Math.round(size * 0.2));
	const core = Math.max(2, Math.round(size * 0.16));
	if (kind === SKIN_STONE) {
		// a darker inner face with a dotted rim: chiselled stone
		return {
			position: "absolute", left: core, top: core, right: core, bottom: core,
			backgroundColor: "rgba(0,0,0,0.18)",
			borderWidth: Math.max(1, Math.round(size * 0.06)), borderStyle: "dotted", borderColor: "rgba(0,0,0,0.35)",
		};
	}
	if (kind === SKIN_CRYSTAL) {
		// a bright facet turned on its corner
		const facet = Math.round(size * 0.42);
		return {
			position: "absolute", left: (size - facet) / 2 - 2, top: (size - facet) / 2 - 2, width: facet, height: facet,
			backgroundColor: "rgba(255,255,255,0.35)", borderWidth: 1, borderColor: "rgba(255,255,255,0.7)",
			transform: [{ rotate: "45deg" }],
		};
	}
	if (kind === SKIN_LAVA) {
		// a glowing core
		return {
			position: "absolute", left: core, top: core, right: core, bottom: core, borderRadius: size,
			backgroundColor: "rgba(255,214,90,0.75)", boxShadow: `0 0 ${Math.round(size * 0.3)}px rgba(255,140,0,0.95)`,
		};
	}
	if (kind === SKIN_NEON) {
		// a dark, hollow middle: only the bright rim is left, like a neon tube
		return {
			position: "absolute", left: inset - 1, top: inset - 1, right: inset - 1, bottom: inset - 1,
			backgroundColor: "rgba(0,0,0,0.78)", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)",
		};
	}
	if (kind === SKIN_PIXEL) {
		// one hard square highlight in the corner, like a sprite's lit pixel
		const px = Math.max(2, Math.round(size * 0.2));
		return { position: "absolute", left: 0, top: 0, width: px, height: px, backgroundColor: "rgba(255,255,255,0.7)" };
	}
	if (kind === SKIN_GLASS) {
		// a diagonal glint across the pane
		const band = Math.max(3, Math.round(size * 0.18));
		return {
			position: "absolute", left: Math.round(size * 0.12), top: -2, width: band, height: size,
			backgroundColor: "rgba(255,255,255,0.45)", transform: [{ rotate: "35deg" }],
		};
	}
	if (kind === SKIN_METAL) {
		// the upper half catches the light, with a thin bright line where it ends
		return {
			position: "absolute", left: 0, top: 0, right: 0, height: Math.round(size * 0.38),
			backgroundColor: "rgba(255,255,255,0.28)", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.65)",
		};
	}
	if (kind === SKIN_WOOD) {
		// two grain lines
		return {
			position: "absolute", left: 0, right: 0, top: Math.round(size * 0.22), height: Math.round(size * 0.34),
			borderTopWidth: Math.max(1, Math.round(size * 0.05)), borderBottomWidth: Math.max(1, Math.round(size * 0.05)),
			borderColor: "rgba(0,0,0,0.28)",
		};
	}
	if (kind === SKIN_CANDY) {
		// a white wrapper stripe
		const stripe = Math.max(3, Math.round(size * 0.2));
		return {
			position: "absolute", left: Math.round((size - stripe) / 2) - 2, top: -2, width: stripe, height: size,
			backgroundColor: "rgba(255,255,255,0.55)", transform: [{ rotate: "-45deg" }],
		};
	}
	if (kind === SKIN_ORB) {
		// a ring around a bright core
		return {
			position: "absolute", left: core, top: core, right: core, bottom: core, borderRadius: size,
			borderWidth: Math.max(1, Math.round(size * 0.07)), borderColor: "rgba(255,255,255,0.6)", backgroundColor: "rgba(255,255,255,0.12)",
		};
	}
	if (kind === SKIN_LIQUID) {
		// a shine on a drop
		const shine = Math.max(3, Math.round(size * 0.26));
		return {
			position: "absolute", left: Math.round(size * 0.18), top: Math.round(size * 0.14), width: shine, height: Math.round(shine * 0.7),
			borderRadius: shine, backgroundColor: "rgba(255,255,255,0.65)", transform: [{ rotate: "-25deg" }],
		};
	}
	return null;
}

// Declared before the worklets that use it: a worklet captures the functions it calls when it is defined.
function kindShape(kind: number, size: number, hex: string): Record<string, unknown> {
	"worklet";
	if (kind === SKIN_LIQUID) return { borderRadius: Math.round(size * 0.42) };
	if (kind === SKIN_NEON) return { boxShadow: `0 0 ${Math.round(size * 0.25)}px ${hex}` };
	if (kind === SKIN_STONE) return { borderRadius: 1 };
	if (kind === SKIN_PIXEL) return { borderRadius: 0 };
	if (kind === SKIN_GLASS) return { borderRadius: Math.round(size * 0.12), overflow: "hidden" };
	if (kind === SKIN_METAL) return { borderRadius: Math.round(size * 0.08), overflow: "hidden" };
	if (kind === SKIN_WOOD) return { borderRadius: Math.round(size * 0.06), overflow: "hidden" };
	if (kind === SKIN_CANDY) return { borderRadius: Math.round(size * 0.3), overflow: "hidden" };
	if (kind === SKIN_ORB) return { borderRadius: Math.round(size * 0.5) };
	return {};
}

/** Extra block style per kind (the liquid drop is round; neon glows). */
export function skinBlockShape(code: number, size: number, hex: string): Record<string, unknown> {
	"worklet";
	const own = kindShape(code & 15, size, hex);
	const shaped = shapeStyle((code >> 8) & 15, size);
	return shaped ? { ...own, ...shaped } : own;
}


/** The look of a block while it appears (t: 0 -> 1). */
export function skinAppear(code: number, t: number, size: number): Record<string, unknown> {
	"worklet";
	const kind = code & 15;
	const u = 1 - t;
	if (kind === SKIN_STONE) return { transform: [{ translateY: -size * 0.35 * u * u }], opacity: 1 };
	if (kind === SKIN_CRYSTAL) return { opacity: t, transform: [{ rotate: `${u * 25}deg` }, { scale: 0.7 + 0.3 * t }] };
	if (kind === SKIN_LAVA) return { opacity: 0.4 + 0.6 * t, transform: [{ scale: 1 + 0.12 * Math.sin(t * Math.PI) }] };
	if (kind === SKIN_NEON) return { opacity: t < 0.3 ? 0.2 : t < 0.45 ? 1 : t < 0.6 ? 0.35 : 1 };
	if (kind === SKIN_LIQUID) return { transform: [{ scaleX: 1 + 0.25 * u }, { scaleY: 1 - 0.35 * u }] };
	// pixel: snaps in four steps
	if (kind === SKIN_PIXEL) return { opacity: 1, transform: [{ scale: 0.25 + 0.75 * Math.min(1, Math.ceil(t * 4) / 4) }] };
	if (kind === SKIN_GLASS) return { opacity: t, transform: [{ scale: 1.25 - 0.25 * t }] };
	if (kind === SKIN_METAL) return { opacity: 1, transform: [{ translateY: -size * 0.5 * u * u }, { scale: 1 + 0.08 * Math.sin(t * Math.PI) }] };
	if (kind === SKIN_WOOD) return { opacity: 1, transform: [{ scaleY: 0.3 + 0.7 * t }] };
	if (kind === SKIN_CANDY) return { opacity: 1, transform: [{ scale: 1 + 0.3 * Math.sin(t * Math.PI) * u }, { rotate: `${-30 * u}deg` }] };
	if (kind === SKIN_ORB) return { opacity: t, transform: [{ scale: 0.4 + 0.6 * t }] };
	// bevel: a small pop
	return { transform: [{ scale: 1 + 0.15 * Math.sin(t * Math.PI) }] };
}

/** How a cleared block goes (p: 0 -> 1). dx/dy/rot are the cell's own fall direction for the bevel. */
export function skinClear(code: number, p: number, size: number, dx: number, dy: number, rot: number): Record<string, unknown> {
	"worklet";
	const kind = code & 15;
	if (kind === SKIN_STONE) return { opacity: 1 - p, transform: [{ translateY: size * 2.2 * p * p }] };
	if (kind === SKIN_CRYSTAL) return { opacity: 1 - p, transform: [{ scale: 1 + 0.9 * p }, { rotate: `${45 * p}deg` }] };
	if (kind === SKIN_LAVA) return { opacity: 1 - p, transform: [{ translateY: size * 0.5 * p }, { scaleY: 1 - p }, { scaleX: 1 + 0.3 * p }] };
	if (kind === SKIN_NEON) return { opacity: p < 0.2 ? 1 : p < 0.35 ? 0.1 : p < 0.5 ? 0.8 : 1 - p };
	if (kind === SKIN_LIQUID) return { opacity: 1 - p, transform: [{ scale: 1 + 0.6 * p }] };
	if (kind === SKIN_PIXEL) return { opacity: p >= 1 ? 0 : 1, transform: [{ scale: Math.max(0, 1 - Math.ceil(p * 4) / 4) }] };
	if (kind === SKIN_GLASS) return { opacity: 1 - p, transform: [{ scale: 1 + 0.4 * p }, { rotate: `${20 * p}deg` }] };
	if (kind === SKIN_METAL) return { opacity: 1 - p, transform: [{ translateY: size * 1.8 * p * p }, { rotate: `${rot * 0.5 * p}deg` }] };
	if (kind === SKIN_WOOD) return { opacity: 1 - p, transform: [{ scaleY: 1 - p }, { translateY: size * 0.4 * p }] };
	if (kind === SKIN_CANDY) return { opacity: 1 - p, transform: [{ scale: 1 + 0.8 * p }, { rotate: `${180 * p}deg` }] };
	if (kind === SKIN_ORB) return { opacity: 1 - p, transform: [{ translateY: -size * 1.2 * p }, { scale: 1 - 0.4 * p }] };
	const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
	return {
		opacity: 1 - e,
		transform: [{ scale: 1 - e * 0.5 }, { translateX: dx * e }, { translateY: dy * e }, { rotate: `${rot * e}deg` }],
	};
}
