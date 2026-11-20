import { SHOP_ITEMS } from "./Shop";
import { textureShape } from "./SkinTextures";

// How a piece skin looks and moves beyond its colors: the block's surface, how a placed block appears and how a
// cleared block goes. Runs in worklets too (plain values only).
//
// Every skin has its own style: a kind (the family: how it appears and clears), a block shape that suits its theme and
// its own themed surface (constants/SkinTextures.ts, components/SkinTexture.tsx). No two skins share a surface.

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
	piece_season_dawn: "orb",
	piece_season_nova: "crystal",
	piece_season_snowfall: "glass",
	piece_premium_snowglass: "glass",
	piece_premium_goldholly: "crystal",
	piece_premium_emberleaf: "wood",
	piece_premium_harvestmoon: "orb",
	piece_season_garland: "neon",
	piece_season_confetti: "candy",
	piece_season_sparkler: "crystal",
	piece_season_heartbeat: "liquid",
	piece_season_quartz: "crystal",
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

// Shapes: 0 is the kind's own; 1 sharp, 2 soft corners, 3 round, 4 leaf (two round corners), 5 the other leaf.
const S_SHARP = 1, S_SOFT = 2, S_ROUND = 3, S_LEAF = 4, S_LEAF2 = 5;

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

/**
 * Each piece skin gets its kind and the shape its theme asks for (SkinTextures), else the next shape of its family. The
 * code packs kind | shape << 8; 0 is the plain classic block.
 */
function buildStyleCodes(): Map<string, number> {
	const codes = new Map<string, number>([["piece_classic", 0]]);
	const perKind = new Map<SkinKind, number>();
	for (const item of SHOP_ITEMS) {
		if (item.category !== "piece_skin" || codes.has(item.id)) continue;
		const kindName = getSkinKind(item.id);
		const nth = perKind.get(kindName) ?? 0;
		perKind.set(kindName, nth + 1);
		const shapes = SHAPE_ORDER[kindName];
		const shape = textureShape(item.id) || shapes[nth % shapes.length];
		codes.set(item.id, KIND_IDS[kindName] | (shape << 8));
	}
	return codes;
}

/** The skin's style packed in one number (kind and shape); 0 is the plain classic block. */
export function getSkinKindId(pieceSkinId: string = "piece_classic"): number {
	if (!styleCodes) styleCodes = buildStyleCodes();
	return styleCodes.get(pieceSkinId) ?? KIND_IDS[getSkinKind(pieceSkinId)];
}

/** The family part of a style code. */
export function kindOf(code: number): number {
	"worklet";
	return code & 15;
}

/** Only the corner rounding of the skin's block, for layers that must follow its outline. */
export function skinCorners(code: number, size: number): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(skinBlockShape(code, size, "#000"))) if (/Radius$/.test(key)) out[key] = value;
	return out;
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
