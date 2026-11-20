// The animation of every piece skin, as data. Each themed skin has its own trail (while its piece is dragged), place
// effect (the piece lands), clear effect (its blocks go), line effect (a bar along a cleared row or column) and idle
// shimmer (a tiny spark on a block of the board now and then); the six chest-only skins and the eight season pass skins add more particles and a combo
// effect that grows with the combo. The maths is in constants/SkinFxMath.ts, the drawing in components/SkinFx.tsx.
//
// All effects are pixel art: square pixels of the skin's own pixel size, snapped to a grid, no blur. Plain values only
// (they are read from worklets).

// ---- motions (how a particle moves)
export const M_BURST = 0; // flies out and slows down
export const M_RISE = 1; // floats up, swaying
export const M_FALL = 2; // falls, faster and faster
export const M_ORBIT = 3; // circles around its block
export const M_TRACE = 4; // runs along straight lines with a right-angle turn, like a circuit trace
export const M_SPIRAL = 5; // winds outward
export const M_DRIFT = 6; // floats sideways, fading in and out
export const M_BLINK = 7; // stays and flickers
export const M_SHOOT = 8; // shoots straight out at full speed
export const M_BOUNCE = 9; // hops on the spot
export const M_FOUNTAIN = 10; // goes up and comes down (gravity)
export const M_PULSE = 11; // stays and swells
export const M_ZIGZAG = 12; // runs in a jagged line
export const M_CRUMBLE = 13; // falls in steps
export const M_TWINKLE = 14; // grows and shrinks on the spot
export const M_BUBBLE = 15; // rises and swells, swaying wide

// ---- shapes (a unit u is one pixel of the pixel art)
export const S_DOT = 0; // u x u
export const S_BAR = 1; // 3u x u
export const S_TALL = 2; // u x 3u
export const S_PLUS = 3; // five pixels
export const S_X = 4; // five pixels, diagonal
export const S_RING = 5; // hollow square
export const S_GEM = 6; // four pixels round a hole
export const S_STREAK = 7; // 4u long, along its flight

// ---- ends (how a particle goes)
export const EN_FADE = 0;
export const EN_SHRINK = 1;
export const EN_CUT = 2;

// ---- bars along a cleared line
export const BM_SWEEP = 1; // a bar runs along the line
export const BM_FLASH = 2; // the line strobes
export const BM_SPLIT = 3; // grows from the middle to both ends
export const BM_SWELL = 4; // thin, thick, thin
export const BM_DASH = 5; // a bar runs along it in jerky steps
export const BM_WIPE = 6; // fills from one end

// ---- where a combo effect starts
export const CP_CENTER = 0;
export const CP_RAIN = 1; // along the top
export const CP_BOTTOM = 2; // along the bottom
export const CP_SIDES = 3; // from the left and right edge
export const CP_SCATTER = 4; // anywhere

export type Fx = {
	m: number; // motion
	s: number; // shape
	c: string[]; // colors; "*" is the color of the block
	n: number; // particles per block
	u: number; // size in pixels of the art
	t: number; // life (ms)
	d: number; // reach (blocks)
	g?: number; // gravity (blocks, down is positive)
	e?: number; // how it ends
	a?: number; // fixed direction (degrees, 0 right, 90 down) ...
	w?: number; // ... and how wide a cone around it (degrees)
};
export type Beam = { k: number; c: string[]; th: number; t: number; dir: number }; // dir: 0 forward, 1 back, 2 either
export type IdleFx = { fx: Fx; every: number; k: number }; // k sparks, each shining once every `every` ms
export type ComboFx = { fx: Fx; pat: number; base: number; per: number; max: number };
export type SkinAnim = {
	trail: Fx;
	place: Fx;
	clear: Fx;
	beam: Beam;
	idle: IdleFx;
	/** Chest skins only: more particles on every place and clear. */
	ex?: { place: Fx; clear: Fx };
	/** Chest skins only: an effect that grows with the combo. */
	combo?: ComboFx;
};

const f = (m: number, s: number, c: string[], n: number, u: number, t: number, d: number, o: { g?: number; e?: number; a?: number; w?: number } = {}): Fx => ({ m, s, c, n, u, t, d, ...o });
const bm = (k: number, c: string[], th: number, t: number, dir = 0): Beam => ({ k, c, th, t, dir });
const idle = (fx: Fx, every: number, k = 2): IdleFx => ({ fx, every, k });

const BU = M_BURST, RI = M_RISE, FA = M_FALL, OR = M_ORBIT, TR = M_TRACE, SP = M_SPIRAL, DR = M_DRIFT, BL = M_BLINK;
const SH = M_SHOOT, BO = M_BOUNCE, FO = M_FOUNTAIN, PU = M_PULSE, ZZ = M_ZIGZAG, CR = M_CRUMBLE, TW = M_TWINKLE, BB = M_BUBBLE;
const DO = S_DOT, BA = S_BAR, TA = S_TALL, PL = S_PLUS, XX = S_X, RG = S_RING, GM = S_GEM, ST = S_STREAK;

export const SKIN_ANIMATIONS: Record<string, SkinAnim> = {
	// ---------------------------------------------------------------- mine and stone: dust, chips, nuggets
	piece_minecraft: {
		trail: f(FA, DO, ["#8B5A2B", "#6B7280", "#4B5563"], 1, 1, 520, 0.6, { g: 0.8 }),
		place: f(BU, DO, ["#A8A29E", "#78716C", "#57534E"], 3, 1, 380, 0.55, { g: 0.6 }),
		clear: f(FO, DO, ["#78716C", "#8B5A2B", "#A8A29E", "#57534E"], 3, 2, 640, 0.9, { g: 1.5, e: EN_SHRINK }),
		beam: bm(BM_DASH, ["#E7E5E4", "#78716C"], 2, 460),
		idle: idle(f(TW, PL, ["#F5F5F4"], 1, 1, 800, 0), 3400),
	},
	piece_minecraft_moss: {
		trail: f(DR, DO, ["#3F9D2A", "#A7E36B"], 1, 1, 700, 0.9),
		place: f(BU, PL, ["#A7E36B", "#3F9D2A"], 2, 1, 420, 0.6),
		clear: f(FA, XX, ["#3F9D2A", "#A7E36B", "#16A34A"], 3, 1, 820, 1.4),
		beam: bm(BM_WIPE, ["#A7E36B", "#3F9D2A"], 2, 520),
		idle: idle(f(DR, DO, ["#A7E36B"], 1, 1, 1300, 0.6), 3800),
	},
	piece_minecraft_deepslate: {
		trail: f(TR, DO, ["#5EF2F5", "#94A3B8"], 1, 1, 480, 0.8),
		place: f(SH, ST, ["#5EF2F5", "#E2E8F0"], 2, 1, 360, 1.1),
		clear: f(BL, PL, ["#5EF2F5", "#94A3B8", "#E2E8F0"], 2, 1, 700, 0.8, { e: EN_CUT }),
		beam: bm(BM_FLASH, ["#5EF2F5", "#E2E8F0"], 2, 420),
		idle: idle(f(BL, DO, ["#5EF2F5"], 1, 1, 900, 0, { e: EN_CUT }), 3000),
	},
	piece_minecraft_gold: {
		trail: f(RI, DO, ["#E8B10C", "#FFF2A8"], 1, 1, 640, 0.8),
		place: f(BO, DO, ["#FFF2A8", "#E8B10C"], 3, 1, 560, 0.9),
		clear: f(BO, BA, ["#FFF2A8", "#E8B10C", "#FFFFFF"], 3, 1, 760, 1.1, { e: EN_SHRINK }),
		beam: bm(BM_SWEEP, ["#FFF2A8", "#E8B10C"], 2, 520),
		idle: idle(f(TW, XX, ["#FFF2A8"], 1, 1, 900, 0), 3200),
	},
	piece_minecraft_nether: {
		trail: f(RI, TA, ["#FF4500", "#FFB000"], 1, 1, 600, 0.9),
		place: f(BU, BA, ["#FFB000", "#DC2626"], 3, 1, 400, 0.7),
		clear: f(RI, DO, ["#FFB000", "#FF4500", "#7F1D1D"], 3, 2, 900, 1.8),
		beam: bm(BM_SWELL, ["#FF7A00", "#FFB000"], 2, 560),
		idle: idle(f(RI, DO, ["#FFB000"], 1, 1, 1100, 0.9), 3300),
	},
	piece_minecraft_prismarine: {
		trail: f(BB, DO, ["#7DEBFF", "#2DD4BF"], 1, 1, 800, 1),
		place: f(PU, RG, ["#7DEBFF", "#E0FFFF"], 1, 1, 520, 0.8),
		clear: f(BB, RG, ["#7DEBFF", "#2DD4BF", "#E0FFFF"], 2, 1, 900, 1.3),
		beam: bm(BM_SPLIT, ["#7DEBFF", "#2DD4BF"], 2, 500),
		idle: idle(f(TW, GM, ["#E0FFFF"], 1, 1, 900, 0), 3600),
	},

	// ---------------------------------------------------------------- crystals and gems: facets, sparkles, rays
	piece_crystal: {
		trail: f(TW, PL, ["#BFF3FF", "#FFFFFF"], 1, 1, 520, 0),
		place: f(BU, GM, ["#7DEBFF", "#FFFFFF"], 3, 1, 420, 0.7),
		clear: f(BU, ST, ["#7DEBFF", "#E0FFFF", "#FFFFFF"], 3, 1, 520, 1.2),
		beam: bm(BM_SWEEP, ["#FFFFFF", "#7DEBFF"], 1, 420),
		idle: idle(f(TW, XX, ["#FFFFFF"], 1, 1, 800, 0), 3000),
	},
	piece_crystal_aqua: {
		trail: f(DR, GM, ["#7DEBFF", "#BAE6FD"], 1, 1, 700, 0.8),
		place: f(PU, GM, ["#7DEBFF", "#E0F2FE"], 1, 1, 480, 0.9),
		clear: f(OR, GM, ["#7DEBFF", "#BAE6FD", "#2DD4BF"], 2, 1, 760, 0.9),
		beam: bm(BM_SWELL, ["#BAE6FD", "#7DEBFF"], 1, 480, 1),
		idle: idle(f(BB, DO, ["#BAE6FD"], 1, 1, 1100, 0.7), 3500),
	},
	piece_crystal_amethyst: {
		trail: f(SP, DO, ["#C77DFF", "#F0ABFC"], 1, 1, 600, 0.7),
		place: f(BU, XX, ["#C77DFF", "#F5D0FE"], 2, 1, 440, 0.7),
		clear: f(SP, GM, ["#C77DFF", "#A855F7", "#F5D0FE"], 3, 1, 780, 1.4),
		beam: bm(BM_DASH, ["#F0ABFC", "#A855F7"], 2, 500, 1),
		idle: idle(f(TW, PL, ["#F5D0FE"], 1, 1, 850, 0), 3300),
	},
	piece_crystal_rose: {
		trail: f(RI, XX, ["#FDA4AF", "#FB7185"], 1, 1, 640, 0.8),
		place: f(RI, DO, ["#FDA4AF", "#FFE4E6"], 3, 1, 400, 0.6),
		clear: f(DR, XX, ["#FDA4AF", "#FB7185", "#FFE4E6"], 3, 1, 1000, 1.5),
		beam: bm(BM_WIPE, ["#FFE4E6", "#FB7185"], 2, 560, 1),
		idle: idle(f(TW, DO, ["#FFE4E6"], 1, 1, 900, 0), 3100),
	},
	piece_crystal_emerald: {
		trail: f(TR, XX, ["#34D399", "#A7F3D0"], 1, 1, 520, 0.8),
		place: f(BO, DO, ["#34D399", "#D1FAE5"], 2, 1, 520, 0.8),
		clear: f(OR, DO, ["#34D399", "#10B981", "#D1FAE5"], 3, 1, 760, 1),
		beam: bm(BM_SPLIT, ["#A7F3D0", "#10B981"], 1, 480, 0),
		idle: idle(f(TW, GM, ["#D1FAE5"], 1, 1, 850, 0), 3700),
	},
	piece_crystal_sun: {
		trail: f(SH, DO, ["#FDE047", "#FFFFFF"], 1, 1, 380, 0.8),
		place: f(BU, ST, ["#FDE047", "#FFFFFF"], 1, 2, 460, 1),
		clear: f(SH, BA, ["#FDE047", "#FBBF24", "#FFFFFF"], 3, 1, 480, 1.4),
		beam: bm(BM_FLASH, ["#FFFFFF", "#FDE047"], 3, 460),
		idle: idle(f(TW, PL, ["#FFF7AE"], 1, 2, 900, 0), 2900),
	},
	piece_ruby_cut: {
		trail: f(BL, DO, ["#FB7185", "#BE123C"], 1, 1, 560, 0.7, { e: EN_CUT }),
		place: f(BU, GM, ["#FB7185", "#FFE4E6"], 3, 1, 420, 0.65),
		clear: f(BL, DO, ["#FB7185", "#E11D48", "#FFE4E6"], 3, 1, 720, 1, { e: EN_CUT }),
		beam: bm(BM_SWELL, ["#FB7185", "#9F1239"], 2, 520),
		idle: idle(f(TW, GM, ["#FFE4E6"], 1, 1, 850, 0), 3500),
	},
	piece_sapphire_cut: {
		trail: f(ZZ, DO, ["#93C5FD", "#60A5FA"], 1, 1, 460, 0.8),
		place: f(SH, DO, ["#BFDBFE", "#3B82F6"], 3, 1, 340, 1),
		clear: f(ZZ, ST, ["#BFDBFE", "#60A5FA", "#FFFFFF"], 3, 1, 560, 1.4),
		beam: bm(BM_SWEEP, ["#FFFFFF", "#3B82F6"], 1, 400, 1),
		idle: idle(f(BL, PL, ["#DBEAFE"], 1, 1, 800, 0, { e: EN_CUT }), 3000),
	},
	piece_jade_tile: {
		trail: f(BB, GM, ["#6EE7B7", "#059669"], 1, 1, 760, 0.9),
		place: f(PU, DO, ["#6EE7B7", "#D1FAE5"], 1, 2, 480, 0.8),
		clear: f(PU, GM, ["#6EE7B7", "#34D399", "#064E3B"], 2, 2, 760, 1.2),
		beam: bm(BM_WIPE, ["#6EE7B7", "#064E3B"], 2, 620),
		idle: idle(f(TW, DO, ["#D1FAE5"], 1, 1, 1000, 0), 3900),
	},
	piece_topaz_tile: {
		trail: f(RI, PL, ["#FBBF24", "#FDE68A"], 1, 1, 620, 0.7),
		place: f(BO, BA, ["#FDE68A", "#F59E0B"], 2, 1, 520, 0.8),
		clear: f(BO, DO, ["#FDE68A", "#F59E0B", "#FFFBEB"], 3, 2, 760, 1.1),
		beam: bm(BM_DASH, ["#FDE68A", "#B45309"], 2, 480),
		idle: idle(f(TW, XX, ["#FFFBEB"], 1, 1, 900, 0), 3300),
	},

	// ---------------------------------------------------------------- fire and forge: sparks, embers, cracks
	piece_lava: {
		trail: f(FO, DO, ["#FFB000", "#FF4D00"], 1, 1, 560, 0.7, { g: 1.2 }),
		place: f(FO, DO, ["#FFE066", "#FF7A00", "#FF4D00"], 3, 1, 400, 0.8, { g: 0.9 }),
		clear: f(FO, BA, ["#FFE066", "#FF7A00", "#B91C1C"], 3, 1, 780, 1.5, { g: 1.8 }),
		beam: bm(BM_SWELL, ["#FFB000", "#FF4D00"], 3, 600),
		idle: idle(f(RI, DO, ["#FFE066", "#FF7A00"], 1, 1, 1200, 0.9), 3000),
	},
	piece_lava_obsidian: {
		trail: f(CR, DO, ["#FFE066", "#1C1917"], 1, 1, 520, 0.8),
		place: f(BU, BA, ["#FFE066", "#44403C"], 2, 1, 380, 0.6),
		clear: f(CR, DO, ["#FFE066", "#FF7A00", "#292524"], 4, 1, 800, 1.4, { g: 1.2 }),
		beam: bm(BM_FLASH, ["#FFE066", "#1C1917"], 2, 440),
		idle: idle(f(BL, DO, ["#FFE066"], 1, 1, 800, 0, { e: EN_CUT }), 3400),
	},
	piece_lava_solar: {
		trail: f(OR, DO, ["#FFF3B0", "#FF9F1C"], 1, 1, 560, 0.7),
		place: f(OR, RG, ["#FFF3B0", "#FF9F1C"], 1, 2, 500, 1.1),
		clear: f(SP, PL, ["#FFF3B0", "#FF9F1C", "#FF4D00"], 3, 1, 820, 1.5),
		beam: bm(BM_SPLIT, ["#FFF3B0", "#FF9F1C"], 3, 520),
		idle: idle(f(TW, PL, ["#FFF3B0"], 1, 2, 1000, 0), 3200),
	},
	piece_lava_ember: {
		trail: f(RI, GM, ["#FF6B1A", "#FFE066"], 1, 1, 700, 0.9),
		place: f(FO, DO, ["#FF6B1A", "#FFE066"], 3, 1, 460, 0.7, { g: 1 }),
		clear: f(FO, XX, ["#FF6B1A", "#FFE066", "#7C2D12"], 3, 1, 900, 1.6, { g: 1.4 }),
		beam: bm(BM_WIPE, ["#FF6B1A", "#7C2D12"], 1, 640),
		idle: idle(f(RI, DO, ["#FF6B1A", "#FFE066"], 1, 1, 1400, 1.1), 2600, 3),
	},
	piece_lava_basalt: {
		trail: f(CR, BA, ["#A8A29E", "#FF7A00"], 1, 1, 560, 0.7),
		place: f(CR, DO, ["#A8A29E", "#57534E", "#FF7A00"], 3, 1, 400, 0.5, { g: 0.7 }),
		clear: f(CR, BA, ["#A8A29E", "#FF7A00", "#44403C"], 3, 1, 780, 1.2, { g: 1 }),
		beam: bm(BM_DASH, ["#FF7A00", "#44403C"], 2, 520),
		idle: idle(f(PU, RG, ["#FF7A00"], 1, 1, 1000, 0.6), 3600),
	},
	piece_lava_magma: {
		trail: f(BB, RG, ["#FF9F1C", "#FFF3B0"], 1, 1, 740, 0.8),
		place: f(BB, RG, ["#FF9F1C", "#FF4D00"], 1, 1, 520, 0.9),
		clear: f(BU, RG, ["#FF4D00", "#FF9F1C", "#7C2D12"], 2, 1, 760, 1.4, { g: 0.6 }),
		beam: bm(BM_SWELL, ["#FFF3B0", "#FF4D00"], 2, 640, 1),
		idle: idle(f(BB, DO, ["#FFF3B0"], 1, 1, 1100, 0.8), 3000),
	},
	piece_magma_ice: {
		trail: f(ZZ, PL, ["#BAE6FD", "#FF9F1C"], 1, 1, 460, 0.7),
		place: f(SH, DO, ["#BAE6FD", "#FFB000"], 3, 1, 360, 0.9),
		clear: f(ZZ, PL, ["#FFFFFF", "#BAE6FD", "#FF9F1C", "#FFE066"], 3, 1, 640, 1.3),
		beam: bm(BM_FLASH, ["#BAE6FD", "#FF9F1C"], 2, 480),
		idle: idle(f(TW, XX, ["#FFFFFF", "#FFE066"], 1, 1, 850, 0), 3100),
	},

	// ---------------------------------------------------------------- circuits and tech: traces, scan lines, glitches
	piece_circuit: {
		trail: f(TR, BA, ["#FDE047", "#00FF9D"], 1, 1, 500, 0.9),
		place: f(TR, DO, ["#FDE047", "#00FF9D"], 3, 1, 420, 1),
		clear: f(TR, BA, ["#FDE047", "#00FF9D", "#00D4FF"], 3, 1, 700, 1.6),
		beam: bm(BM_DASH, ["#FDE047", "#00FF9D"], 1, 440),
		idle: idle(f(TR, DO, ["#00FF9D"], 1, 1, 900, 0.8), 2800),
	},
	piece_circuit_matrix: {
		trail: f(FA, TA, ["#4ADE80", "#EFFFB0"], 1, 1, 520, 0.9),
		place: f(FA, TA, ["#4ADE80", "#EFFFB0"], 2, 1, 420, 0.7),
		clear: f(FA, TA, ["#22C55E", "#4ADE80", "#EFFFB0"], 3, 1, 900, 1.8),
		beam: bm(BM_WIPE, ["#EFFFB0", "#16A34A"], 1, 480, 0),
		idle: idle(f(FA, TA, ["#4ADE80"], 1, 1, 900, 0.9), 2700, 3),
	},
	piece_circuit_neon: {
		trail: f(ZZ, ST, ["#A5F3FC", "#FF7AE6"], 1, 1, 440, 0.8),
		place: f(BU, BA, ["#A5F3FC", "#FF7AE6"], 3, 1, 380, 0.8),
		clear: f(ZZ, BA, ["#A5F3FC", "#FF7AE6", "#FFFFFF"], 3, 1, 600, 1.5),
		beam: bm(BM_SWEEP, ["#A5F3FC", "#FF7AE6"], 2, 420, 2),
		idle: idle(f(BL, PL, ["#FF7AE6"], 1, 1, 800, 0, { e: EN_CUT }), 3000),
	},
	piece_circuit_plasma: {
		trail: f(OR, PL, ["#FFFFFF", "#7DD3FC"], 1, 1, 520, 0.6),
		place: f(PU, PL, ["#FFFFFF", "#7DD3FC"], 1, 2, 460, 1),
		clear: f(PU, PL, ["#FFFFFF", "#38BDF8", "#818CF8"], 2, 2, 700, 1.5),
		beam: bm(BM_SWELL, ["#FFFFFF", "#38BDF8"], 3, 520),
		idle: idle(f(PU, DO, ["#FFFFFF"], 1, 1, 700, 0.7), 2500),
	},
	piece_circuit_terminal: {
		trail: f(BL, BA, ["#7CFFB2", "#14532D"], 1, 1, 480, 0.5, { e: EN_CUT }),
		place: f(BL, DO, ["#7CFFB2", "#14532D"], 3, 1, 420, 0.7, { e: EN_CUT }),
		clear: f(BL, BA, ["#7CFFB2", "#16A34A", "#14532D"], 3, 1, 780, 1, { e: EN_CUT }),
		beam: bm(BM_FLASH, ["#7CFFB2", "#14532D"], 1, 420),
		idle: idle(f(BL, BA, ["#7CFFB2"], 1, 1, 700, 0, { e: EN_CUT }), 2400),
	},
	piece_circuit_candy: {
		trail: f(BO, DO, ["#FF2BD6", "#A2D2FF"], 1, 1, 500, 0.6),
		place: f(BO, PL, ["#FF2BD6", "#A2D2FF"], 2, 1, 500, 0.8),
		clear: f(BO, PL, ["#FF2BD6", "#A2D2FF", "#FFFFFF"], 3, 1, 760, 1.2),
		beam: bm(BM_DASH, ["#FF2BD6", "#A2D2FF"], 2, 500, 1),
		idle: idle(f(TW, PL, ["#A2D2FF"], 1, 1, 850, 0), 3200),
	},
	piece_copper_wire: {
		trail: f(ZZ, TA, ["#FDBA74", "#2DD4BF"], 1, 1, 440, 0.8),
		place: f(SH, DO, ["#FDBA74", "#2DD4BF"], 3, 1, 360, 0.9),
		clear: f(ZZ, TA, ["#FDBA74", "#F97316", "#2DD4BF"], 3, 1, 640, 1.5),
		beam: bm(BM_SWEEP, ["#FDBA74", "#2DD4BF"], 1, 440),
		idle: idle(f(ZZ, DO, ["#2DD4BF"], 1, 1, 700, 0.7), 2900),
	},
	piece_laser_grid: {
		trail: f(SH, TA, ["#FF5A5A", "#A5F3FC"], 1, 1, 340, 0.8),
		place: f(SH, BA, ["#FF5A5A", "#A5F3FC"], 3, 1, 320, 1.2),
		clear: f(SH, TA, ["#FF5A5A", "#A5F3FC", "#FFFFFF"], 3, 1, 480, 1.8),
		beam: bm(BM_SPLIT, ["#FF5A5A", "#A5F3FC"], 1, 380),
		idle: idle(f(SH, BA, ["#A5F3FC"], 1, 1, 500, 0.9), 2600),
	},
	piece_night_market: {
		trail: f(RI, ST, ["#FDE047", "#BE123C"], 1, 1, 720, 1),
		place: f(PU, GM, ["#FDE047", "#FB7185"], 1, 1, 500, 0.9),
		clear: f(RI, GM, ["#FDE047", "#BE123C", "#FB7185"], 3, 1, 960, 1.9),
		beam: bm(BM_SWELL, ["#FDE047", "#BE123C"], 2, 600),
		idle: idle(f(BB, GM, ["#FDE047"], 1, 1, 1200, 0.8), 3400),
	},
	piece_arcade_gum: {
		trail: f(BB, XX, ["#22D3EE", "#F9A8D4"], 1, 1, 780, 0.9),
		place: f(BO, RG, ["#22D3EE", "#F9A8D4"], 1, 1, 520, 0.8),
		clear: f(BB, DO, ["#22D3EE", "#F9A8D4", "#FFFFFF"], 3, 2, 860, 1.4),
		beam: bm(BM_WIPE, ["#22D3EE", "#F9A8D4"], 2, 500, 2),
		idle: idle(f(BB, RG, ["#F9A8D4"], 1, 1, 1100, 0.8), 3400),
	},

	// ---------------------------------------------------------------- space and sky: stars, orbits, drifting light
	piece_cosmic_ore: {
		trail: f(OR, RG, ["#C7D2FE", "#818CF8"], 1, 1, 600, 0.6),
		place: f(SH, DO, ["#C7D2FE", "#6366F1"], 3, 1, 380, 1),
		clear: f(OR, PL, ["#C7D2FE", "#818CF8", "#FFFFFF"], 2, 1, 880, 1.1),
		beam: bm(BM_SWEEP, ["#C7D2FE", "#4338CA"], 2, 560, 2),
		idle: idle(f(TW, DO, ["#FFFFFF"], 1, 1, 1000, 0), 3000, 3),
	},
	piece_void_pearl: {
		trail: f(DR, PL, ["#E9D5FF", "#581C87"], 1, 1, 760, 0.8),
		place: f(PU, DO, ["#E9D5FF", "#7E22CE"], 1, 3, 560, 0.9),
		clear: f(SP, RG, ["#E9D5FF", "#7E22CE", "#000000"], 2, 2, 820, 1.4),
		beam: bm(BM_SWELL, ["#E9D5FF", "#3B0764"], 3, 640),
		idle: idle(f(TW, RG, ["#E9D5FF"], 1, 1, 1100, 0), 3600),
	},
	piece_moonstone: {
		trail: f(DR, RG, ["#E0F2FE", "#C7D2FE"], 1, 1, 820, 0.9),
		place: f(PU, DO, ["#E0F2FE", "#A5B4FC"], 1, 2, 500, 0.7),
		clear: f(DR, DO, ["#E0F2FE", "#C7D2FE", "#FFFFFF"], 3, 2, 1000, 1.6),
		beam: bm(BM_WIPE, ["#E0F2FE", "#6366F1"], 1, 700, 2),
		idle: idle(f(DR, DO, ["#E0F2FE"], 1, 1, 1500, 0.8), 4000),
	},
	piece_storm_cloud: {
		trail: f(FA, ST, ["#93C5FD", "#64748B"], 1, 1, 440, 0.9),
		place: f(SH, TA, ["#FDE047", "#93C5FD"], 2, 1, 320, 1),
		clear: f(SH, ST, ["#FDE047", "#FFFFFF", "#93C5FD"], 3, 1, 460, 1.7),
		beam: bm(BM_FLASH, ["#FDE047", "#FFFFFF"], 2, 400),
		idle: idle(f(ZZ, BA, ["#FDE047"], 1, 1, 560, 0.6), 3300),
	},
	piece_aurora_glass: {
		trail: f(DR, BA, ["#5EEAD4", "#A78BFA"], 1, 1, 800, 0.9),
		place: f(DR, RG, ["#5EEAD4", "#A78BFA"], 1, 1, 560, 1),
		clear: f(DR, BA, ["#5EEAD4", "#A78BFA", "#86EFAC"], 3, 1, 1100, 1.4),
		beam: bm(BM_WIPE, ["#5EEAD4", "#A78BFA"], 2, 720, 1),
		idle: idle(f(DR, BA, ["#5EEAD4"], 1, 1, 1500, 0.9), 3600),
	},

	// ---------------------------------------------------------------- toxic and dark: pulses, glow, shadows
	piece_radioactive: {
		trail: f(PU, RG, ["#A3E635", "#365314"], 1, 1, 600, 0.6),
		place: f(PU, PL, ["#A3E635", "#F7FEE7"], 2, 1, 420, 0.9),
		clear: f(PU, RG, ["#A3E635", "#84CC16", "#F7FEE7"], 2, 2, 800, 1.6),
		beam: bm(BM_SWELL, ["#A3E635", "#1A2E05"], 3, 620),
		idle: idle(f(PU, RG, ["#A3E635"], 1, 1, 1100, 0.7), 2800),
	},
	piece_lime_shadow: {
		trail: f(TW, DO, ["#ECFCCB", "#1A2E05"], 1, 1, 600, 0),
		place: f(TW, DO, ["#ECFCCB", "#1A2E05"], 3, 1, 380, 0.6),
		clear: f(TW, BA, ["#ECFCCB", "#BEF264", "#1A2E05"], 3, 1, 760, 1.2),
		beam: bm(BM_SPLIT, ["#ECFCCB", "#1A2E05"], 2, 500, 1),
		idle: idle(f(TW, PL, ["#ECFCCB"], 1, 1, 900, 0), 3300),
	},
	piece_ghost_ink: {
		trail: f(DR, TA, ["#E5E7EB", "#6B7280"], 1, 1, 900, 0.9),
		place: f(RI, DO, ["#E5E7EB", "#9CA3AF"], 2, 1, 600, 0.8),
		clear: f(DR, TA, ["#E5E7EB", "#9CA3AF", "#4B5563"], 3, 1, 1100, 1.5),
		beam: bm(BM_SWEEP, ["#F3F4F6", "#6B7280"], 2, 720, 2),
		idle: idle(f(RI, TA, ["#E5E7EB"], 1, 1, 1600, 0.9), 4200),
	},
	piece_shadow_gold: {
		trail: f(TW, XX, ["#FDE68A", "#44403C"], 1, 1, 560, 0),
		place: f(BU, XX, ["#FDE68A", "#CA8A04"], 2, 1, 400, 0.7),
		clear: f(TW, PL, ["#FDE68A", "#FACC15", "#292524"], 3, 1, 800, 1),
		beam: bm(BM_DASH, ["#FDE68A", "#292524"], 1, 540),
		idle: idle(f(TW, GM, ["#FDE68A"], 1, 1, 900, 0), 3400),
	},
	piece_royal_velvet: {
		trail: f(FA, GM, ["#FDE047", "#7E22CE"], 1, 1, 640, 0.8),
		place: f(PU, GM, ["#FDE047", "#C084FC"], 1, 1, 500, 0.9),
		clear: f(FA, GM, ["#FDE047", "#C084FC", "#581C87"], 3, 1, 900, 1.7),
		beam: bm(BM_WIPE, ["#FDE047", "#6B21A8"], 2, 640, 2),
		idle: idle(f(TW, DO, ["#FDE047"], 1, 1, 1000, 0), 3500),
	},

	// ---------------------------------------------------------------- nature and food: spores, petals, bubbles, confetti
	piece_forest_mushroom: {
		trail: f(DR, XX, ["#FEF3C7", "#DC2626"], 1, 1, 800, 0.9),
		place: f(BU, DO, ["#FEF3C7", "#DC2626", "#4D7C0F"], 3, 1, 420, 0.6),
		clear: f(BU, DO, ["#FEF3C7", "#DC2626", "#84CC16"], 4, 1, 900, 1.5, { g: 0.5 }),
		beam: bm(BM_WIPE, ["#FEF3C7", "#4D7C0F"], 2, 560),
		idle: idle(f(DR, PL, ["#FEF3C7"], 1, 1, 1500, 0.7), 3900),
	},
	piece_desert_clay: {
		trail: f(CR, PL, ["#FDBA74", "#92400E"], 1, 1, 600, 0.8),
		place: f(BU, BA, ["#FDBA74", "#B45309", "#FEF3C7"], 3, 1, 400, 0.6),
		clear: f(CR, PL, ["#FDBA74", "#D97706", "#FEF3C7"], 3, 1, 900, 1.6, { g: 1 }),
		beam: bm(BM_SWEEP, ["#FEF3C7", "#B45309"], 2, 560),
		idle: idle(f(FA, DO, ["#FDBA74"], 1, 1, 1100, 0.7), 3300),
	},
	piece_snow_mint: {
		trail: f(FA, XX, ["#FFFFFF", "#A7F3D0"], 1, 1, 760, 0.8),
		place: f(BU, XX, ["#FFFFFF", "#A7F3D0"], 3, 1, 420, 0.6),
		clear: f(FA, DO, ["#FFFFFF", "#A7F3D0", "#6EE7B7"], 4, 1, 1000, 1.5),
		beam: bm(BM_SPLIT, ["#FFFFFF", "#A7F3D0"], 2, 540, 2),
		idle: idle(f(FA, DO, ["#FFFFFF"], 1, 1, 1500, 0.8), 3500),
	},
	piece_ocean_shell: {
		trail: f(RI, RG, ["#5EEAD4", "#FB7185"], 1, 1, 800, 0.9),
		place: f(RI, RG, ["#5EEAD4", "#FB7185"], 1, 1, 520, 0.8),
		clear: f(BB, GM, ["#5EEAD4", "#FB7185", "#FFFFFF"], 3, 1, 1000, 1.5),
		beam: bm(BM_SWELL, ["#5EEAD4", "#FB7185"], 2, 640, 2),
		idle: idle(f(BB, GM, ["#5EEAD4"], 1, 1, 1200, 0.8), 3600),
	},
	piece_pearl_shell: {
		trail: f(TW, GM, ["#FBCFE8", "#FFFFFF"], 1, 1, 560, 0),
		place: f(BO, GM, ["#FBCFE8", "#FFFFFF"], 2, 1, 520, 0.8),
		clear: f(TW, GM, ["#FBCFE8", "#FFFFFF", "#E9D5FF"], 3, 1, 900, 1.1),
		beam: bm(BM_FLASH, ["#FBCFE8", "#FFFFFF"], 1, 480),
		idle: idle(f(TW, RG, ["#FFFFFF"], 1, 1, 1000, 0), 3200),
	},
	piece_neon_fruit: {
		trail: f(BO, XX, ["#DC2626", "#4ADE80"], 1, 1, 500, 0.6),
		place: f(BU, RG, ["#DC2626", "#FDA4AF"], 2, 1, 420, 0.8),
		clear: f(BO, XX, ["#DC2626", "#4ADE80", "#FDA4AF"], 3, 1, 800, 1.3),
		beam: bm(BM_DASH, ["#DC2626", "#4ADE80"], 2, 480, 2),
		idle: idle(f(BO, DO, ["#4ADE80"], 1, 1, 800, 0.4), 3000),
	},
	piece_peach_soda: {
		trail: f(BB, PL, ["#FDBA74", "#FFFFFF"], 1, 1, 780, 0.9),
		place: f(BB, DO, ["#FDBA74", "#FFFFFF"], 3, 1, 520, 0.7),
		clear: f(BB, PL, ["#FDBA74", "#FB923C", "#FFFFFF"], 3, 1, 900, 1.6),
		beam: bm(BM_WIPE, ["#FDBA74", "#FFFFFF"], 2, 540, 1),
		idle: idle(f(BB, DO, ["#FFFFFF"], 1, 1, 1100, 0.8), 2900, 3),
	},
	piece_candy_pop: {
		trail: f(BO, PL, ["#F472B6", "#60A5FA", "#FDE047"], 1, 1, 520, 0.6),
		place: f(BU, PL, ["#F472B6", "#60A5FA", "#FDE047"], 3, 1, 420, 0.8),
		clear: f(SP, DO, ["#F472B6", "#60A5FA", "#FDE047", "#4ADE80"], 4, 1, 800, 1.5),
		beam: bm(BM_SWEEP, ["#F472B6", "#60A5FA"], 3, 480, 2),
		idle: idle(f(TW, XX, ["#FDE047"], 1, 1, 850, 0), 3000),
	},
	piece_paper_cut: {
		trail: f(FA, BA, ["#F3F4F6", "#111827"], 1, 1, 640, 0.8),
		place: f(BU, BA, ["#F3F4F6", "#111827"], 3, 1, 380, 0.6),
		clear: f(FA, BA, ["#F3F4F6", "#9CA3AF", "#111827"], 4, 1, 900, 1.6),
		beam: bm(BM_DASH, ["#F3F4F6", "#111827"], 1, 520),
		idle: idle(f(DR, BA, ["#F3F4F6"], 1, 1, 1300, 0.8), 3700),
	},
	piece_ink_stamp: {
		trail: f(CR, GM, ["#111827", "#EF4444"], 1, 1, 560, 0.7),
		place: f(PU, DO, ["#EF4444", "#111827"], 1, 3, 400, 0.6, { e: EN_CUT }),
		clear: f(CR, GM, ["#111827", "#EF4444", "#374151"], 3, 1, 800, 1.3, { g: 0.8 }),
		beam: bm(BM_FLASH, ["#111827", "#EF4444"], 2, 440),
		idle: idle(f(BL, DO, ["#EF4444"], 1, 1, 800, 0, { e: EN_CUT }), 3500),
	},
	piece_monochrome: {
		trail: f(BL, TA, ["#FFFFFF", "#6B7280"], 1, 1, 440, 0.6, { e: EN_CUT }),
		place: f(SH, BA, ["#FFFFFF", "#6B7280"], 3, 1, 340, 0.9),
		clear: f(BL, TA, ["#FFFFFF", "#9CA3AF", "#111827"], 3, 1, 700, 1.1, { e: EN_CUT }),
		beam: bm(BM_FLASH, ["#FFFFFF", "#111827"], 3, 440),
		idle: idle(f(BL, TA, ["#FFFFFF"], 1, 1, 700, 0, { e: EN_CUT }), 3100),
	},

	// ---------------------------------------------------------------- chest skins: the same, with more of everything
	piece_chest_aurora: {
		trail: f(RI, BA, ["#5EEAD4", "#A78BFA"], 2, 1, 760, 0.9),
		place: f(SP, DO, ["#5EEAD4", "#A78BFA", "#99F6E4"], 3, 1, 520, 0.9),
		clear: f(RI, TA, ["#5EEAD4", "#A78BFA", "#99F6E4"], 3, 1, 1100, 2),
		beam: bm(BM_WIPE, ["#5EEAD4", "#A78BFA"], 3, 700, 1),
		idle: idle(f(DR, BA, ["#5EEAD4", "#C4B5FD"], 1, 1, 1500, 0.9), 2800, 4),
		ex: {
			place: f(RI, TA, ["#99F6E4", "#C4B5FD"], 2, 1, 800, 1.2),
			clear: f(DR, BA, ["#5EEAD4", "#A78BFA", "#99F6E4"], 2, 1, 1300, 1.8),
		},
		combo: { fx: f(RI, TA, ["#5EEAD4", "#A78BFA", "#99F6E4", "#C4B5FD"], 1, 1, 1500, 2.6), pat: CP_BOTTOM, base: 6, per: 2, max: 22 },
	},
	piece_chest_cosmic: {
		trail: f(OR, XX, ["#FDE68A", "#F0ABFC"], 2, 1, 640, 0.8),
		place: f(SH, ST, ["#FDE68A", "#F0ABFC", "#FFFFFF"], 3, 1, 380, 1.3),
		clear: f(SP, ST, ["#FDE68A", "#F0ABFC", "#818CF8"], 3, 1, 900, 1.6),
		beam: bm(BM_SWEEP, ["#FDE68A", "#6366F1"], 2, 560),
		idle: idle(f(TW, PL, ["#FFFFFF", "#FDE68A"], 1, 1, 900, 0), 2600, 4),
		ex: {
			place: f(TW, PL, ["#FFFFFF", "#FDE68A"], 2, 1, 700, 1),
			clear: f(OR, DO, ["#FFFFFF", "#F0ABFC", "#818CF8"], 2, 1, 1000, 1.2),
		},
		combo: { fx: f(SH, ST, ["#FDE68A", "#F0ABFC", "#FFFFFF"], 1, 1, 760, 3.2, { a: 35, w: 30 }), pat: CP_SIDES, base: 4, per: 2, max: 20 },
	},
	piece_chest_toxic: {
		trail: f(PU, GM, ["#A3E635", "#ECFCCB"], 2, 1, 600, 0.7),
		place: f(ZZ, RG, ["#A3E635", "#ECFCCB"], 2, 1, 520, 1.1),
		clear: f(BB, XX, ["#A3E635", "#84CC16", "#ECFCCB"], 3, 1, 1000, 1.7),
		beam: bm(BM_SWELL, ["#A3E635", "#365314"], 3, 680, 2),
		idle: idle(f(PU, RG, ["#A3E635", "#ECFCCB"], 1, 1, 1000, 0.8), 2400, 4),
		ex: {
			place: f(BB, DO, ["#A3E635", "#ECFCCB"], 2, 1, 800, 1),
			clear: f(PU, RG, ["#A3E635", "#ECFCCB"], 1, 2, 900, 1.8),
		},
		combo: { fx: f(PU, RG, ["#A3E635", "#ECFCCB", "#84CC16"], 1, 2, 1000, 3.4), pat: CP_CENTER, base: 3, per: 1, max: 12 },
	},
	piece_chest_dragon: {
		trail: f(FO, PL, ["#FBBF24", "#F97316"], 2, 1, 620, 0.8, { g: 1.3 }),
		place: f(FO, BA, ["#FBBF24", "#F97316", "#DC2626"], 3, 1, 460, 1, { g: 1.1 }),
		clear: f(FO, TA, ["#FBBF24", "#F97316", "#DC2626"], 3, 1, 1000, 2, { g: 1.9 }),
		beam: bm(BM_SWELL, ["#FBBF24", "#DC2626"], 3, 680),
		idle: idle(f(RI, DO, ["#FBBF24", "#F97316"], 1, 1, 1300, 1), 2400, 4),
		ex: {
			place: f(BU, DO, ["#FBBF24", "#F97316"], 3, 1, 500, 1.2, { g: 0.9 }),
			clear: f(RI, DO, ["#FBBF24", "#F97316", "#7F1D1D"], 3, 2, 1100, 2.2),
		},
		combo: { fx: f(FO, TA, ["#FBBF24", "#F97316", "#DC2626"], 1, 1, 1100, 2.4, { g: 1.7 }), pat: CP_BOTTOM, base: 6, per: 2, max: 22 },
	},
	piece_chest_prism: {
		trail: f(OR, GM, ["#F472B6", "#60A5FA", "#FDE047", "#4ADE80"], 2, 1, 560, 0.8),
		place: f(PU, GM, ["#F472B6", "#60A5FA", "#FDE047"], 2, 1, 500, 1),
		clear: f(BU, GM, ["#F87171", "#FB923C", "#FDE047", "#4ADE80", "#60A5FA", "#C084FC"], 4, 1, 760, 1.6),
		beam: bm(BM_FLASH, ["#F472B6", "#60A5FA"], 3, 520),
		idle: idle(f(TW, PL, ["#F87171", "#FDE047", "#4ADE80", "#60A5FA"], 1, 1, 900, 0), 2400, 4),
		ex: {
			place: f(TW, PL, ["#F87171", "#FDE047", "#60A5FA"], 2, 1, 700, 1),
			clear: f(SP, DO, ["#F87171", "#FB923C", "#FDE047", "#4ADE80", "#60A5FA", "#C084FC"], 3, 1, 900, 1.8),
		},
		combo: { fx: f(FA, DO, ["#F87171", "#FB923C", "#FDE047", "#4ADE80", "#60A5FA", "#C084FC"], 1, 2, 1200, 2.5, { g: 0.6 }), pat: CP_RAIN, base: 8, per: 3, max: 22 },
	},
	piece_chest_relic: {
		trail: f(FO, GM, ["#FFD700", "#FEF9C3"], 2, 1, 560, 0.8, { g: 1.1 }),
		place: f(BO, BA, ["#FFD700", "#FEF9C3"], 3, 1, 520, 0.9),
		clear: f(BO, GM, ["#FFD700", "#FDE047", "#FEF9C3"], 3, 1, 900, 1.4),
		beam: bm(BM_SWEEP, ["#FEF9C3", "#B45309"], 3, 560, 2),
		idle: idle(f(TW, GM, ["#FFF7AE", "#FFD700"], 1, 1, 900, 0), 2500, 4),
		ex: {
			place: f(TW, XX, ["#FFFFFF", "#FFD700"], 2, 1, 700, 1),
			clear: f(FO, PL, ["#FFD700", "#FEF9C3", "#B45309"], 2, 1, 1000, 1.7, { g: 1.5 }),
		},
		combo: { fx: f(FA, BA, ["#FFD700", "#FDE047", "#FEF9C3"], 1, 2, 1100, 2.6, { g: 0.8 }), pat: CP_RAIN, base: 6, per: 2, max: 20 },
	},

	// ---------------------------------------------------------------- season pass exclusives: like the chest skins they
	// get the extra particles and a combo effect (secret, handed out only by the pass)
	piece_season_dawn: {
		trail: f(SH, ST, ["#FDBA74", "#FEF3C7"], 2, 1, 560, 0.9, { a: 270, w: 120 }),
		place: f(BU, DO, ["#FB923C", "#FEF3C7"], 3, 1, 440, 0.9),
		clear: f(RI, ST, ["#FDBA74", "#FB923C", "#FEF3C7"], 3, 1, 960, 1.9),
		beam: bm(BM_WIPE, ["#FEF3C7", "#FB923C"], 3, 600),
		idle: idle(f(RI, DO, ["#FEF3C7", "#FDBA74"], 1, 1, 1200, 0.9), 2600, 4),
		ex: {
			place: f(RI, DO, ["#FDBA74", "#FFFFFF"], 2, 1, 700, 1),
			clear: f(BU, PL, ["#FDBA74", "#FEF3C7", "#9A3412"], 2, 1, 800, 1.5),
		},
		combo: { fx: f(RI, ST, ["#FDBA74", "#FEF3C7", "#FB923C"], 1, 1, 1200, 2.8), pat: CP_BOTTOM, base: 6, per: 2, max: 22 },
	},
	piece_season_nova: {
		trail: f(SP, XX, ["#67E8F9", "#F0ABFC"], 2, 1, 600, 0.8),
		place: f(BU, PL, ["#67E8F9", "#FFFFFF", "#F0ABFC"], 3, 1, 420, 1.1),
		clear: f(SH, GM, ["#67E8F9", "#F0ABFC", "#FFFFFF"], 3, 1, 820, 1.8),
		beam: bm(BM_SPLIT, ["#67E8F9", "#F0ABFC"], 3, 540),
		idle: idle(f(TW, XX, ["#FFFFFF", "#67E8F9"], 1, 1, 900, 0), 2400, 4),
		ex: {
			place: f(PU, RG, ["#67E8F9", "#F0ABFC"], 2, 1, 600, 1.2),
			clear: f(SP, DO, ["#FFFFFF", "#67E8F9", "#F0ABFC"], 2, 1, 1000, 1.8),
		},
		combo: { fx: f(SP, ST, ["#67E8F9", "#F0ABFC", "#FFFFFF"], 1, 1, 900, 3.2), pat: CP_CENTER, base: 4, per: 2, max: 18 },
	},
	// season pass premium exclusives (December 2026)
	piece_premium_snowglass: {
		trail: f(FA, PL, ["#E0F2FE", "#7DD3FC"], 2, 1, 700, 0.8, { g: 0.5 }),
		place: f(DR, DO, ["#FFFFFF", "#7DD3FC"], 3, 1, 600, 0.9),
		clear: f(FA, GM, ["#FFFFFF", "#7DD3FC", "#BAE6FD"], 3, 1, 1100, 1.7, { g: 0.6 }),
		beam: bm(BM_SWELL, ["#FFFFFF", "#7DD3FC"], 3, 640),
		idle: idle(f(TW, PL, ["#FFFFFF", "#BAE6FD"], 1, 1, 1100, 0), 2500, 4),
		ex: {
			place: f(TW, GM, ["#FFFFFF", "#7DD3FC"], 2, 1, 700, 1),
			clear: f(DR, GM, ["#FFFFFF", "#E0F2FE", "#38BDF8"], 2, 1, 1200, 1.8),
		},
		combo: { fx: f(DR, GM, ["#FFFFFF", "#7DD3FC", "#E0F2FE"], 1, 2, 1500, 2.9), pat: CP_RAIN, base: 10, per: 3, max: 26 },
	},
	piece_premium_goldholly: {
		trail: f(TR, ST, ["#FDE047", "#4ADE80"], 2, 1, 520, 0.9),
		place: f(BU, ST, ["#FDE047", "#4ADE80", "#FB7185"], 3, 1, 400, 1.2),
		clear: f(SH, PL, ["#FDE047", "#4ADE80", "#FB7185"], 3, 1, 760, 1.8),
		beam: bm(BM_SWEEP, ["#FFFBEB", "#4ADE80"], 2, 500, 2),
		idle: idle(f(TW, ST, ["#FFFBEB", "#FDE047"], 1, 1, 850, 0), 2300, 4),
		ex: {
			place: f(ZZ, DO, ["#FDE047", "#BBF7D0"], 2, 1, 520, 1),
			clear: f(FO, DO, ["#FDE047", "#FFFBEB", "#FB7185"], 2, 1, 900, 1.6, { g: 1.3 }),
		},
		combo: { fx: f(TR, ST, ["#FDE047", "#4ADE80", "#FB7185"], 1, 1, 760, 3), pat: CP_BOTTOM, base: 5, per: 2, max: 20 },
	},
	piece_season_snowfall: {
		trail: f(FA, PL, ["#FFFFFF", "#BAE6FD"], 2, 1, 700, 0.8, { g: 0.5 }),
		place: f(DR, DO, ["#FFFFFF", "#BAE6FD"], 3, 1, 600, 0.9),
		clear: f(FA, RG, ["#FFFFFF", "#BAE6FD", "#93C5FD"], 3, 1, 1100, 1.6, { g: 0.6 }),
		beam: bm(BM_SWELL, ["#FFFFFF", "#93C5FD"], 3, 640),
		idle: idle(f(FA, DO, ["#FFFFFF"], 1, 1, 1400, 0.8, { g: 0.4 }), 2700, 4),
		ex: {
			place: f(TW, PL, ["#FFFFFF", "#BAE6FD"], 2, 1, 700, 1),
			clear: f(DR, PL, ["#FFFFFF", "#E0F2FE"], 2, 1, 1200, 1.8),
		},
		combo: { fx: f(DR, PL, ["#FFFFFF", "#BAE6FD", "#E0F2FE"], 1, 2, 1500, 2.8), pat: CP_RAIN, base: 10, per: 3, max: 26 },
	},
	piece_season_garland: {
		trail: f(BL, PL, ["#F87171", "#4ADE80", "#FDE047"], 2, 1, 520, 0.8),
		place: f(BL, DO, ["#F87171", "#4ADE80", "#FEF08A"], 3, 1, 500, 0.8),
		clear: f(BL, RG, ["#DC2626", "#4ADE80", "#FEF08A"], 3, 1, 900, 1.3, { e: EN_CUT }),
		beam: bm(BM_DASH, ["#F87171", "#4ADE80"], 3, 560),
		idle: idle(f(BL, DO, ["#F87171", "#4ADE80", "#FDE047"], 1, 1, 1000, 0, { e: EN_CUT }), 2400, 4),
		ex: {
			place: f(TW, DO, ["#FEF08A", "#F87171"], 2, 1, 700, 1),
			clear: f(OR, DO, ["#F87171", "#4ADE80", "#FEF08A"], 2, 1, 1000, 1.2),
		},
		combo: { fx: f(BL, DO, ["#F87171", "#4ADE80", "#FDE047"], 1, 2, 1100, 2.4), pat: CP_SIDES, base: 8, per: 3, max: 24 },
	},
	piece_season_confetti: {
		trail: f(CR, TA, ["#FB7185", "#38BDF8", "#FDE047", "#4ADE80"], 2, 1, 600, 0.8),
		place: f(BO, BA, ["#FB7185", "#38BDF8", "#FDE047"], 3, 1, 520, 1),
		clear: f(BU, TA, ["#FB7185", "#38BDF8", "#FDE047", "#4ADE80", "#F472B6"], 4, 1, 900, 1.8),
		beam: bm(BM_FLASH, ["#F472B6", "#FACC15"], 3, 500),
		idle: idle(f(CR, DO, ["#FB7185", "#38BDF8", "#FDE047", "#4ADE80"], 1, 1, 1100, 0.8), 2500, 4),
		ex: {
			place: f(FO, DO, ["#FB7185", "#38BDF8", "#FDE047"], 2, 1, 800, 1.1, { g: 1.2 }),
			clear: f(FA, BA, ["#FB7185", "#38BDF8", "#FDE047", "#4ADE80"], 3, 1, 1100, 2, { g: 0.9 }),
		},
		combo: { fx: f(BU, TA, ["#FB7185", "#38BDF8", "#FDE047", "#4ADE80", "#F472B6"], 1, 2, 1000, 2.8), pat: CP_SCATTER, base: 8, per: 3, max: 26 },
	},
	piece_season_sparkler: {
		trail: f(TR, ST, ["#FDE047", "#FFFBEB"], 2, 1, 480, 0.9),
		place: f(BU, ST, ["#FDE047", "#FFFBEB", "#FBBF24"], 3, 1, 380, 1.2),
		clear: f(SH, PL, ["#FDE047", "#FFFBEB", "#FBBF24"], 3, 1, 700, 1.7),
		beam: bm(BM_SWEEP, ["#FFFBEB", "#FBBF24"], 2, 480, 2),
		idle: idle(f(TW, ST, ["#FFFBEB", "#FDE047"], 1, 1, 800, 0), 2300, 4),
		ex: {
			place: f(ZZ, DO, ["#FDE047", "#FFFFFF"], 2, 1, 500, 1),
			clear: f(FO, DO, ["#FBBF24", "#FFFBEB", "#FDE047"], 2, 1, 900, 1.6, { g: 1.4 }),
		},
		combo: { fx: f(TR, ST, ["#FDE047", "#FFFBEB", "#FBBF24"], 1, 1, 700, 3), pat: CP_BOTTOM, base: 5, per: 2, max: 20 },
	},
	piece_season_heartbeat: {
		trail: f(PU, PL, ["#FB7185", "#FFF1F2"], 2, 1, 560, 0.7),
		place: f(PU, GM, ["#FB7185", "#FFF1F2"], 2, 1, 480, 0.9),
		clear: f(PU, DO, ["#FB7185", "#FDA4AF", "#FFF1F2"], 3, 2, 900, 1.5),
		beam: bm(BM_SWELL, ["#FB7185", "#FFF1F2"], 3, 700, 1),
		idle: idle(f(PU, DO, ["#FB7185", "#FFF1F2"], 1, 1, 900, 0.8), 2200, 4),
		ex: {
			place: f(RI, DO, ["#FDA4AF", "#FFF1F2"], 2, 1, 800, 1),
			clear: f(BB, GM, ["#FB7185", "#FFF1F2"], 2, 1, 1000, 1.7),
		},
		combo: { fx: f(PU, DO, ["#FB7185", "#FDA4AF", "#FFF1F2"], 1, 2, 1000, 3.2), pat: CP_CENTER, base: 3, per: 1, max: 13 },
	},
	piece_season_quartz: {
		trail: f(TW, RG, ["#F9A8D4", "#E9D5FF"], 2, 1, 560, 0.7),
		place: f(PU, ST, ["#F9A8D4", "#E9D5FF", "#FFFFFF"], 2, 1, 460, 1),
		clear: f(TW, TA, ["#F9A8D4", "#E9D5FF", "#FBCFE8"], 3, 1, 900, 1.5),
		beam: bm(BM_SPLIT, ["#E9D5FF", "#F9A8D4"], 2, 620, 2),
		idle: idle(f(TW, GM, ["#FFFFFF", "#E9D5FF"], 1, 1, 900, 0), 2450, 4),
		ex: {
			place: f(TW, PL, ["#FFFFFF", "#F9A8D4"], 2, 1, 700, 1),
			clear: f(BU, GM, ["#F9A8D4", "#E9D5FF", "#FFFFFF"], 2, 1, 800, 1.4),
		},
		combo: { fx: f(TW, GM, ["#F9A8D4", "#E9D5FF", "#FFFFFF"], 1, 2, 1100, 2.6), pat: CP_SCATTER, base: 5, per: 2, max: 18 },
	},
};

/** The animation of a piece skin, or null for the plain classic block (and any skin that has none). */
export function getSkinAnim(pieceSkinId: string): SkinAnim | null {
	return Object.prototype.hasOwnProperty.call(SKIN_ANIMATIONS, pieceSkinId) ? SKIN_ANIMATIONS[pieceSkinId] : null;
}
