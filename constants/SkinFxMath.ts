import { Platform } from "react-native";
import type { Board } from "./Board";
import { colorToHex } from "./Color";
import { getPieceSkinColor } from "./Piece";
import {
	BM_DASH, BM_FLASH, BM_SPLIT, BM_SWELL, BM_SWEEP, BM_WIPE,
	CP_BOTTOM, CP_CENTER, CP_RAIN, CP_SCATTER, CP_SIDES,
	EN_CUT, EN_SHRINK,
	M_BLINK, M_BOUNCE, M_BUBBLE, M_BURST, M_CRUMBLE, M_DRIFT, M_FALL, M_FOUNTAIN, M_ORBIT, M_PULSE, M_RISE, M_SHOOT, M_SPIRAL, M_TRACE, M_TWINKLE, M_ZIGZAG,
	S_BAR, S_GEM, S_PLUS, S_RING, S_STREAK, S_TALL, S_X,
	type Beam, type Fx, type IdleFx, type SkinAnim,
} from "./SkinAnimations";

// The maths behind the per-skin animations (constants/SkinAnimations.ts holds the data): how one particle moves, how the
// board's changes become particles and beams, and how the idle shimmer picks its cell. Everything here is a plain
// function over plain values, marked as a worklet so the board's UI-thread reactions can call it; the components that
// draw it (components/SkinFx.tsx) only write these values into shared values.

const TAU = Math.PI * 2;

// the board's cell states (constants/Board.tsx BoardBlockType; copied so this file stays free of the app-state hooks)
const CELL_EMPTY = 0;
const CELL_HOVERED = 1;
const CELL_BREAK_FILLED = 2;
const CELL_BREAK_EMPTY = 3;
const CELL_FILLED = 4;

/** boxShadow value of a particle that has no composite pixels (the style keys never go missing, so the last one cannot stick). */
export const NO_SHADOW: string | never[] = Platform.OS === "web" ? "none" : [];

/** One live particle: everything its style needs, fixed when it is spawned. */
export type FxParticle = {
	x: number; y: number; // where it starts (px, centre)
	tx: number; ty: number; // how far it travels (px)
	r: number; an: number; // reach (px) and direction (radians)
	m: number; s: number; e: number; // motion, shape, end
	u: number; // one pixel of the skin's pixel art (px)
	w: number; h: number; bw: number; // box and border (px)
	col: string; sh: string | never[];
	sd: number; // 0..1, its own random number
	g: number; // gravity (px)
	gr: number; // growth of a pulse (scale at the end - 1)
	t: number; // life (ms)
	dl: number; // delay before it starts (ms)
};

/** One line-complete bar. */
export type FxBeam = {
	x: number; y: number; w: number; h: number; // the line's box (px)
	axis: number; k: number; c1: string; c2: string; th: number; t: number; dir: number; u: number; dl: number;
};

export type FxFrame = { x: number; y: number; a: number; sc: number };
export type BoardEvents = {
	placed: number[]; // cells a block just landed on (and stayed)
	cleared: number[]; // cells whose block just went
	lines: number[]; // cleared lines: axis * 1000 + index (axis 0 a row, 1 a column)
};

/** The size of one pixel of the pixel art at this block size. */
export function pixelUnit(blockSize: number): number {
	"worklet";
	return Math.max(2, Math.round(blockSize / 10));
}

/** A small deterministic random number generator (state in st.s), so particles can be planned the same way in tests. */
export function rnd(st: { s: number }): number {
	"worklet";
	st.s = (Math.imul(st.s, 1664525) + 1013904223) >>> 0;
	return st.s / 4294967296;
}

/** One particle of an effect at (cx, cy); j of count is its index in the burst. */
export function spawnParticle(fx: Fx, cx: number, cy: number, B: number, hex: string, st: { s: number }, j: number, count: number, scale: number, delay: number): FxParticle {
	"worklet";
	const u = pixelUnit(B);
	const m = fx.m;
	const r1 = rnd(st);
	const r2 = rnd(st);
	const r3 = rnd(st);
	const r4 = rnd(st);
	const r5 = rnd(st);
	const colors = fx.c;
	let col = colors[(j + Math.floor(r1 * colors.length)) % colors.length];
	if (col === "*") col = hex;
	const reach = fx.d * B * scale * (0.65 + 0.35 * r2);
	let an: number;
	if (fx.a !== undefined) an = ((fx.a + (r3 - 0.5) * (fx.w ?? 0)) * Math.PI) / 180;
	else if (m === M_RISE || m === M_BUBBLE) an = -Math.PI / 2 + (r3 - 0.5) * 0.7;
	else if (m === M_FALL || m === M_CRUMBLE) an = Math.PI / 2 + (r3 - 0.5) * 0.5;
	else if (m === M_FOUNTAIN) an = -Math.PI / 2 + (r3 - 0.5) * 1.3;
	else if (m === M_DRIFT) an = (r3 < 0.5 ? 0 : Math.PI) + (r4 - 0.5) * 0.6;
	else an = ((j + r3 * 0.8) / count) * TAU;
	const tx = Math.cos(an) * reach;
	const ty = Math.sin(an) * reach;
	let x = cx;
	let y = cy;
	if (m === M_BLINK || m === M_TWINKLE) {
		x += (r4 - 0.5) * B * 0.8;
		y += (r5 - 0.5) * B * 0.8;
	} else if (m === M_RISE || m === M_FALL || m === M_DRIFT || m === M_BUBBLE) {
		x += (r4 - 0.5) * B * 0.5;
		y += (r5 - 0.5) * B * 0.4;
	}
	const ku = fx.u * u;
	const s = fx.s;
	let w = ku;
	let h = ku;
	let bw = 0;
	let sh: string | never[] = NO_SHADOW;
	if (s === S_BAR) w = 3 * ku;
	else if (s === S_TALL) h = 3 * ku;
	else if (s === S_STREAK) {
		if (Math.abs(tx) >= Math.abs(ty)) w = 4 * ku;
		else h = 4 * ku;
	} else if (s === S_RING) {
		w = 3 * ku;
		h = 3 * ku;
		bw = ku;
	} else if (s === S_PLUS || s === S_GEM) {
		sh = `${ku}px 0 0 0 ${col}, -${ku}px 0 0 0 ${col}, 0 ${ku}px 0 0 ${col}, 0 -${ku}px 0 0 ${col}`;
	} else if (s === S_X) {
		sh = `${ku}px ${ku}px 0 0 ${col}, -${ku}px ${ku}px 0 0 ${col}, ${ku}px -${ku}px 0 0 ${col}, -${ku}px -${ku}px 0 0 ${col}`;
	}
	return {
		x: Math.round(x / u) * u,
		y: Math.round(y / u) * u,
		tx, ty, r: reach, an,
		m, s, e: fx.e ?? 0, u, w, h, bw, col, sh,
		sd: r5,
		g: (fx.g ?? 0) * B,
		gr: m === M_PULSE ? (reach * 2) / Math.max(w, 1) : 0,
		t: fx.t * (0.85 + 0.3 * r4),
		dl: delay,
	};
}

/** Where a particle is at p (0..1): offset, opacity and scale. Positions snap to the skin's pixel grid, opacity and scale move in steps. */
export function fxFrame(i: FxParticle, p: number, out: FxFrame): void {
	"worklet";
	const m = i.m;
	const tx = i.tx;
	const ty = i.ty;
	const u = i.u;
	let x = 0;
	let y = 0;
	let a = 1;
	let sc = 1;
	if (m === M_BURST) {
		const e = 1 - (1 - p) * (1 - p);
		x = tx * e;
		y = ty * e + i.g * p * p;
	} else if (m === M_RISE) {
		x = tx * p + Math.sin(p * TAU * (1 + i.sd)) * u * 1.5;
		y = ty * p + i.g * p * p;
	} else if (m === M_FALL) {
		x = tx * 0.4 * p;
		y = ty * p * (0.35 + 0.65 * p) + i.g * p * p;
	} else if (m === M_ORBIT) {
		const ang = i.sd * TAU + p * TAU * 1.5;
		const r = i.r * (0.4 + 0.6 * Math.sin(p * Math.PI));
		x = Math.cos(ang) * r;
		y = Math.sin(ang) * r * 0.9;
	} else if (m === M_TRACE) {
		const s1 = Math.min(1, p * 2);
		const s2 = Math.max(0, p * 2 - 1);
		if (i.sd < 0.5) {
			x = tx * s1;
			y = ty * s2;
		} else {
			x = tx * s2;
			y = ty * s1;
		}
	} else if (m === M_SPIRAL) {
		const ang = i.an + p * TAU * 1.25;
		x = Math.cos(ang) * i.r * p;
		y = Math.sin(ang) * i.r * p;
	} else if (m === M_DRIFT) {
		x = tx * p + Math.sin(p * TAU + i.sd * TAU) * u * 1.5;
		y = ty * 0.5 * p + Math.cos(p * TAU + i.sd * TAU) * u;
		a = Math.ceil(Math.sin(p * Math.PI) * 4) / 4;
	} else if (m === M_BLINK) {
		a = Math.floor(p * 9 + i.sd * 5) % 2 === 0 ? 1 : 0.2;
	} else if (m === M_SHOOT) {
		x = tx * p;
		y = ty * p;
	} else if (m === M_BOUNCE) {
		x = tx * p * 0.8;
		y = -i.r * 0.55 * Math.abs(Math.sin(p * Math.PI * 2.5)) * (1 - p * 0.7);
	} else if (m === M_FOUNTAIN) {
		x = tx * p;
		y = ty * p + i.g * p * p;
	} else if (m === M_PULSE) {
		sc = 1 + i.gr * p;
	} else if (m === M_ZIGZAG) {
		const side = (Math.floor(p * 7) % 2) * 2 - 1;
		const len = Math.max(1, i.r);
		x = tx * p + (-ty / len) * side * u * 1.5;
		y = ty * p + (tx / len) * side * u * 1.5;
	} else if (m === M_CRUMBLE) {
		const st = Math.floor(p * 5) / 5;
		x = tx * 0.35 * st;
		y = ty * st + i.g * st * st;
	} else if (m === M_TWINKLE) {
		sc = Math.sin(p * Math.PI);
	} else if (m === M_BUBBLE) {
		x = Math.sin(p * TAU * 1.4 + i.sd * TAU) * i.r * 0.22;
		y = ty * p;
		sc = 0.7 + 0.7 * p;
	}
	// the end: fade in steps, shrink in steps, or stay until it is gone
	if (i.e === EN_SHRINK) sc *= Math.ceil((1 - p) * 4) / 4;
	else if (i.e !== EN_CUT && m !== M_DRIFT) a *= p < 0.35 ? 1 : Math.ceil(((1 - p) / 0.65) * 3) / 3;
	out.x = Math.round(x / u) * u;
	out.y = Math.round(y / u) * u;
	out.a = a;
	out.sc = Math.round(sc * 3) / 3;
}

const HIDDEN = { opacity: 0 };

/** The animated style of one particle at p. */
export function particleStyle(i: FxParticle, p: number, out: FxFrame): object {
	"worklet";
	fxFrame(i, p, out);
	if (out.a <= 0.01 || out.sc <= 0.05) return HIDDEN;
	const hollow = i.s === S_RING || i.s === S_GEM;
	return {
		opacity: out.a,
		width: i.w,
		height: i.h,
		backgroundColor: hollow ? "transparent" : i.col,
		borderWidth: i.bw,
		borderColor: i.col,
		boxShadow: i.sh,
		transform: [{ translateX: i.x + out.x - i.w / 2 }, { translateY: i.y + out.y - i.h / 2 }, { scale: out.sc }],
	};
}

/** A bar for a cleared line (axis 0 row, 1 column; index counts from the board's top left). */
export function spawnBeam(b: Beam, axis: number, index: number, rows: number, cols: number, B: number, pitch: number, seed: number, delay: number): FxBeam {
	"worklet";
	const u = pixelUnit(B);
	const row = axis === 0;
	return {
		x: row ? 0 : index * pitch,
		y: row ? index * pitch : 0,
		w: row ? (cols - 1) * pitch + B : B,
		h: row ? B : (rows - 1) * pitch + B,
		axis, k: b.k, c1: b.c[0], c2: b.c[1] ?? b.c[0], th: b.th, t: b.t,
		dir: b.dir === 2 ? seed % 2 : b.dir, u, dl: delay,
	};
}

const FLASH_STEPS = [1, 0, 1, 0, 1, 0.4];

/** The animated style of one line bar at p. */
export function beamStyle(b: FxBeam, p: number): object {
	"worklet";
	const row = b.axis === 0;
	const full = row ? b.w : b.h;
	let T = b.th * b.u;
	let start = 0;
	let len = full;
	let a = 1;
	let col = b.c1;
	const k = b.k;
	if (k === BM_SWEEP || k === BM_DASH) {
		const seg = full * (k === BM_SWEEP ? 0.3 : 0.22);
		const q = k === BM_DASH ? Math.floor(p * 7) / 7 : p;
		const pos = (full + seg) * q - seg;
		start = Math.max(0, pos);
		len = Math.min(full, pos + seg) - start;
		if (k === BM_DASH && Math.floor(p * 7) % 2 === 1) col = b.c2;
		a = p < 0.85 ? 1 : (1 - p) / 0.15;
	} else if (k === BM_FLASH) {
		const step = Math.min(5, Math.floor(p * 6));
		a = FLASH_STEPS[step];
		col = step % 2 === 0 ? b.c1 : b.c2;
	} else if (k === BM_SPLIT) {
		len = full * Math.min(1, p * 1.4);
		start = (full - len) / 2;
		a = p < 0.6 ? 1 : (1 - p) / 0.4;
	} else if (k === BM_SWELL) {
		T = T * (0.3 + 2.2 * Math.sin(p * Math.PI));
		a = Math.ceil((1 - p * 0.8) * 4) / 4;
	} else if (k === BM_WIPE) {
		len = full * Math.min(1, p * 1.6);
		a = p < 0.55 ? 1 : (1 - p) / 0.45;
	}
	if (len <= 0 || a <= 0.01) return HIDDEN;
	if (b.dir === 1) start = full - start - len;
	T = Math.max(b.u, Math.round(T / b.u) * b.u);
	len = Math.round(len);
	start = Math.round(start);
	return {
		opacity: Math.max(0, Math.min(1, a)),
		left: row ? b.x + start : b.x + b.w / 2 - T / 2,
		top: row ? b.y + b.h / 2 - T / 2 : b.y + start,
		width: row ? len : T,
		height: row ? T : len,
		backgroundColor: col,
		borderWidth: T >= 3 * b.u ? Math.max(1, Math.round(b.u / 2)) : 0,
		borderColor: b.c2,
	};
}

function cellHex(board: Board, idx: number, cols: number, skinId: string): string {
	"worklet";
	const cell = board[Math.floor(idx / cols)][idx % cols];
	return colorToHex(getPieceSkinColor(cell.color, skinId));
}

/** What changed between two boards: blocks that landed, blocks that went, lines that went. strict: the own board, with its hover states. */
export function diffBoards(prev: Board, cur: Board, strict: boolean): BoardEvents {
	"worklet";
	const rows = cur.length;
	const cols = cur[0].length;
	const placed: number[] = [];
	const cleared: number[] = [];
	const flag: boolean[] = [];
	let removed = 0;
	let hover = false;
	for (let y = 0; y < rows; y++) {
		for (let x = 0; x < cols; x++) {
			const pt = prev[y][x].blockType;
			const ct = cur[y][x].blockType;
			const idx = y * cols + x;
			flag.push(false);
			if (pt === CELL_BREAK_FILLED || pt === CELL_BREAK_EMPTY) hover = true;
			if (ct === CELL_FILLED && (pt === CELL_EMPTY || pt === CELL_HOVERED)) placed.push(idx);
			else if (ct === CELL_EMPTY && pt !== CELL_EMPTY && pt !== CELL_HOVERED) {
				// a hover that was only cancelled leaves cells empty too; a real clear takes a block that stood there
				cleared.push(idx);
				flag[idx] = true;
				if (pt === CELL_FILLED || pt === CELL_BREAK_FILLED) removed++;
			}
		}
	}
	const lines: number[] = [];
	const reset = removed === 0 || (strict ? !hover && placed.length === 0 : cleared.length > cols * rows * 0.7);
	if (reset) cleared.length = 0;
	if (cleared.length > 0) {
		for (let y = 0; y < rows; y++) {
			let n = 0;
			let had = 0;
			let now = 0;
			for (let x = 0; x < cols; x++) {
				if (flag[y * cols + x]) n++;
				if (prev[y][x].blockType === CELL_FILLED) had++;
				if (cur[y][x].blockType === CELL_FILLED) now++;
			}
			if (strict ? n === cols : n > 0 && now === 0 && had >= Math.max(1, cols - 5)) lines.push(y);
		}
		for (let x = 0; x < cols; x++) {
			let n = 0;
			let had = 0;
			let now = 0;
			for (let y = 0; y < rows; y++) {
				if (flag[y * cols + x]) n++;
				if (prev[y][x].blockType === CELL_FILLED) had++;
				if (cur[y][x].blockType === CELL_FILLED) now++;
			}
			if (strict ? n === rows : n > 0 && now === 0 && had >= Math.max(1, rows - 5)) lines.push(1000 + x);
		}
	}
	return { placed, cleared, lines };
}

export type PlanOptions = {
	B: number; // block size (px)
	pitch: number; // distance between two blocks' tops (px)
	seed: number;
	combo: number;
	level: number; // 1 full, 0.5 reduced
};
export type FxPlan = { ps: FxParticle[]; bs: FxBeam[] };

const CAP_PLACE = 14;
const CAP_CLEAR = 26;
const CAP_COMBO = 22;

function burst(out: FxParticle[], fx: Fx, cx: number, cy: number, B: number, hex: string, st: { s: number }, n: number, scale: number, delay: number, cap: number): void {
	"worklet";
	for (let j = 0; j < n && out.length < cap; j++) out.push(spawnParticle(fx, cx, cy, B, hex, st, j, n, scale, delay));
}

/** Turns what changed on the board into the particles and bars of the skin's animation. */
export function planEvents(anim: SkinAnim, ev: BoardEvents, prev: Board, cur: Board, skinId: string, o: PlanOptions): FxPlan {
	"worklet";
	const B = o.B;
	const cols = cur[0].length;
	const rows = cur.length;
	const st = { s: (o.seed >>> 0) || 1 };
	const level = o.level;
	const place: FxParticle[] = [];
	const clear: FxParticle[] = [];
	const combo: FxParticle[] = [];
	const bs: FxBeam[] = [];
	const cell = (idx: number, which: number): number => (which === 0 ? (idx % cols) * o.pitch + B / 2 : Math.floor(idx / cols) * o.pitch + B / 2);
	const share = (n: number, count: number, cap: number): number => Math.max(1, Math.min(Math.round(n * level), Math.floor(cap / Math.max(1, count))));
	for (let k = 0; k < ev.placed.length; k++) {
		const idx = ev.placed[k];
		const hex = cellHex(cur, idx, cols, skinId);
		burst(place, anim.place, cell(idx, 0), cell(idx, 1), B, hex, st, share(anim.place.n, ev.placed.length, CAP_PLACE), 1, 0, CAP_PLACE);
		if (anim.ex) burst(place, anim.ex.place, cell(idx, 0), cell(idx, 1), B, hex, st, share(anim.ex.place.n, ev.placed.length, CAP_PLACE), 1, 0, CAP_PLACE);
	}
	for (let k = 0; k < ev.cleared.length; k++) {
		const idx = ev.cleared[k];
		const hex = cellHex(prev, idx, cols, skinId);
		const wave = ((idx % cols) + Math.floor(idx / cols)) % cols;
		const delay = wave * 18;
		burst(clear, anim.clear, cell(idx, 0), cell(idx, 1), B, hex, st, share(anim.clear.n, ev.cleared.length, CAP_CLEAR), 1, delay, CAP_CLEAR);
		if (anim.ex) burst(clear, anim.ex.clear, cell(idx, 0), cell(idx, 1), B, hex, st, share(anim.ex.clear.n, ev.cleared.length, CAP_CLEAR), 1, delay, CAP_CLEAR);
	}
	for (let k = 0; k < ev.lines.length && k < 3; k++) {
		const line = ev.lines[k];
		bs.push(spawnBeam(anim.beam, line >= 1000 ? 1 : 0, line % 1000, rows, cols, B, o.pitch, Math.floor(rnd(st) * 1000), k * 90));
	}
	const c = anim.combo;
	if (c && ev.lines.length > 0 && o.combo >= 2 && level >= 1) {
		const n = Math.min(c.max, c.base + c.per * o.combo);
		const W = (cols - 1) * o.pitch + B;
		const H = (rows - 1) * o.pitch + B;
		const scale = 1 + 0.08 * Math.min(o.combo, 10);
		// from the right edge a streak flies the other way
		const mirrored: Fx = c.fx.a !== undefined ? { ...c.fx, a: 180 - c.fx.a } : c.fx;
		for (let j = 0; j < n; j++) {
			const r1 = rnd(st);
			const r2 = rnd(st);
			let x = r1 * W;
			let y = r2 * H;
			if (c.pat === CP_RAIN) y = -B * 0.3;
			else if (c.pat === CP_BOTTOM) y = H;
			else if (c.pat === CP_SIDES) x = r1 < 0.5 ? 0 : W;
			else if (c.pat === CP_CENTER) {
				x = W / 2 + (r1 - 0.5) * B * 1.2;
				y = H / 2 + (r2 - 0.5) * B * 1.2;
			}
			burst(combo, c.pat === CP_SIDES && x > 0 ? mirrored : c.fx, x, y, B, "#ffffff", st, 1, scale, (j % 6) * 40, CAP_COMBO + 1);
			if (combo.length >= CAP_COMBO) break;
		}
	}
	return { ps: combo.concat(clear, place), bs };
}

/** One trail particle of a dragged piece at (cx, cy). */
export function trailParticle(anim: SkinAnim, cx: number, cy: number, B: number, hex: string, seed: number): FxParticle {
	"worklet";
	const st = { s: (seed >>> 0) || 1 };
	return spawnParticle(anim.trail, cx, cy, B, hex, st, 0, 1, 1, 0);
}

/** The idle shimmer: where its k-th spark is now (a cell that holds a block) and how far along it is, or null while it rests. */
export function idleSpark(idle: IdleFx, board: Board, k: number, clockMs: number, B: number, pitch: number, skinId: string): { part: FxParticle; p: number } | null {
	"worklet";
	const tt = clockMs / idle.every + ((k * 0.618) % 1);
	const cyc = Math.floor(tt);
	const p = ((tt - cyc) * idle.every) / idle.fx.t;
	if (p >= 1) return null;
	const rows = board.length;
	const cols = board[0].length;
	const cells = rows * cols;
	const h = (Math.imul(cyc, 2654435761) + Math.imul(k + 1, 40503) + 12345) >>> 0;
	const step = cells % 7 === 0 ? 11 : 7;
	let found = -1;
	for (let j = 0; j < 28; j++) {
		const idx = (h + j * step) % cells;
		if (board[Math.floor(idx / cols)][idx % cols].blockType === CELL_FILLED) {
			found = idx;
			break;
		}
	}
	if (found < 0) return null;
	const hex = cellHex(board, found, cols, skinId);
	const st = { s: (h ^ 0x9e3779b9) >>> 0 };
	const part = spawnParticle(idle.fx, (found % cols) * pitch + B / 2, Math.floor(found / cols) * pitch + B / 2, B, hex, st, 0, 1, 1, 0);
	return { part, p };
}
