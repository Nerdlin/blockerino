// How a piece skin looks and moves beyond its colors: the block's surface, how a placed block appears and how a
// cleared block goes. Every shop skin belongs to one kind. Runs in worklets too (plain values only).

export type SkinKind = "bevel" | "stone" | "crystal" | "lava" | "neon" | "liquid";

// numeric ids for worklets (comparing numbers is cheapest on the UI thread)
export const SKIN_BEVEL = 0;
export const SKIN_STONE = 1;
export const SKIN_CRYSTAL = 2;
export const SKIN_LAVA = 3;
export const SKIN_NEON = 4;
export const SKIN_LIQUID = 5;

const KIND_IDS: Record<SkinKind, number> = { bevel: SKIN_BEVEL, stone: SKIN_STONE, crystal: SKIN_CRYSTAL, lava: SKIN_LAVA, neon: SKIN_NEON, liquid: SKIN_LIQUID };

const EXTRA: Record<string, SkinKind> = {
	piece_desert_clay: "stone",
	piece_jade_tile: "stone",
	piece_forest_mushroom: "stone",
	piece_topaz_tile: "stone",
	piece_paper_cut: "stone",
	piece_ink_stamp: "stone",
	piece_ruby_cut: "crystal",
	piece_sapphire_cut: "crystal",
	piece_cosmic_ore: "crystal",
	piece_shadow_gold: "crystal",
	piece_snow_mint: "crystal",
	piece_magma_ice: "lava",
	piece_lime_shadow: "lava",
	piece_laser_grid: "neon",
	piece_neon_fruit: "neon",
	piece_radioactive: "neon",
	piece_night_market: "neon",
	piece_copper_wire: "neon",
	piece_ghost_ink: "neon",
	piece_aurora_glass: "liquid",
	piece_pearl_shell: "liquid",
	piece_void_pearl: "liquid",
	piece_moonstone: "liquid",
	piece_ocean_shell: "liquid",
	piece_candy_pop: "liquid",
	piece_peach_soda: "liquid",
	piece_arcade_gum: "liquid",
	piece_storm_cloud: "liquid",
	piece_royal_velvet: "liquid",
};

export function getSkinKind(pieceSkinId: string = "piece_classic"): SkinKind {
	if (EXTRA[pieceSkinId]) return EXTRA[pieceSkinId];
	if (pieceSkinId.startsWith("piece_minecraft")) return "stone";
	if (pieceSkinId.startsWith("piece_crystal")) return "crystal";
	if (pieceSkinId.startsWith("piece_lava")) return "lava";
	if (pieceSkinId.startsWith("piece_circuit")) return "neon";
	return "bevel";
}

export function getSkinKindId(pieceSkinId: string = "piece_classic"): number {
	return KIND_IDS[getSkinKind(pieceSkinId)];
}

/**
 * The extra layer drawn over a filled block (its surface): returns a style for one absolutely placed view inside
 * the block, or null for the plain bevel. `size` is the block size, `hex` its color.
 */
export function skinDecorStyle(kind: number, size: number, hex: string): Record<string, unknown> | null {
	"worklet";
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
			backgroundColor: "rgba(0,0,0,0.78)", borderWidth: 1, borderColor: hex,
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

/** Extra block style per kind (the liquid drop is round; neon glows). */
export function skinBlockShape(kind: number, size: number, hex: string): Record<string, unknown> {
	"worklet";
	if (kind === SKIN_LIQUID) return { borderRadius: Math.round(size * 0.42) };
	if (kind === SKIN_NEON) return { boxShadow: `0 0 ${Math.round(size * 0.25)}px ${hex}` };
	if (kind === SKIN_STONE) return { borderRadius: 1 };
	return {};
}

/** The look of a block while it appears (t: 0 -> 1). */
export function skinAppear(kind: number, t: number, size: number): Record<string, unknown> {
	"worklet";
	const u = 1 - t;
	if (kind === SKIN_STONE) return { transform: [{ translateY: -size * 0.35 * u * u }], opacity: 1 };
	if (kind === SKIN_CRYSTAL) return { opacity: t, transform: [{ rotate: `${u * 25}deg` }, { scale: 0.7 + 0.3 * t }] };
	if (kind === SKIN_LAVA) return { opacity: 0.4 + 0.6 * t, transform: [{ scale: 1 + 0.12 * Math.sin(t * Math.PI) }] };
	if (kind === SKIN_NEON) return { opacity: t < 0.3 ? 0.2 : t < 0.45 ? 1 : t < 0.6 ? 0.35 : 1 };
	if (kind === SKIN_LIQUID) return { transform: [{ scaleX: 1 + 0.25 * u }, { scaleY: 1 - 0.35 * u }] };
	// bevel: a small pop
	return { transform: [{ scale: 1 + 0.15 * Math.sin(t * Math.PI) }] };
}

/** How a cleared block goes (p: 0 -> 1). dx/dy/rot are the cell's own fall direction for the bevel. */
export function skinClear(kind: number, p: number, size: number, dx: number, dy: number, rot: number): Record<string, unknown> {
	"worklet";
	if (kind === SKIN_STONE) return { opacity: 1 - p, transform: [{ translateY: size * 2.2 * p * p }] };
	if (kind === SKIN_CRYSTAL) return { opacity: 1 - p, transform: [{ scale: 1 + 0.9 * p }, { rotate: `${45 * p}deg` }] };
	if (kind === SKIN_LAVA) return { opacity: 1 - p, transform: [{ translateY: size * 0.5 * p }, { scaleY: 1 - p }, { scaleX: 1 + 0.3 * p }] };
	if (kind === SKIN_NEON) return { opacity: p < 0.2 ? 1 : p < 0.35 ? 0.1 : p < 0.5 ? 0.8 : 1 - p };
	if (kind === SKIN_LIQUID) return { opacity: 1 - p, transform: [{ scale: 1 + 0.6 * p }] };
	const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
	return {
		opacity: 1 - e,
		transform: [{ scale: 1 - e * 0.5 }, { translateX: dx * e }, { translateY: dy * e }, { rotate: `${rot * e}deg` }],
	};
}
