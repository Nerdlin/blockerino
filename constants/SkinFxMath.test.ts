import type { Board } from "./Board";
import { SKIN_ANIMATIONS, M_BLINK, M_PULSE, S_PLUS, S_RING, S_STREAK, type Fx } from "./SkinAnimations";
import {
	beamStyle,
	diffBoards,
	fxFrame,
	idleSpark,
	particleStyle,
	pixelUnit,
	planEvents,
	spawnBeam,
	spawnParticle,
	trailParticle,
	type FxFrame,
} from "./SkinFxMath";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

const COLOR = { r: 200, g: 60, b: 60 };
// . empty   # filled   h hovered   b hovered break (a block that would go)   e hovered break (a piece cell that would go)
const TYPES: Record<string, number> = { ".": 0, h: 1, b: 2, e: 3, "#": 4 };

function board(rows: string[]): Board {
	return rows.map((row) => [...row].map((ch) => ({ blockType: TYPES[ch], color: COLOR, hoveredBreakColor: { r: 0, g: 0, b: 0 } })));
}

const frame = (): FxFrame => ({ x: 0, y: 0, a: 1, sc: 1 });
const opts = (combo = 0, level = 1) => ({ B: 40, pitch: 40, seed: 12345, combo, level });

describe("diffBoards", () => {
	it("sees a piece land on the committed board", () => {
		const ev = diffBoards(board(["....", "....", "....", "...."]), board(["....", "##..", "....", "...."]), null);
		expect(ev.placed).toEqual([4, 5]);
		expect(ev.cleared).toEqual([]);
		expect(ev.lines).toEqual([]);
	});

	it("sees a line go, with the piece's own cell and the blocks that stood there", () => {
		const prev = board(["....", "#.##", "....", "...."]);
		const cur = board(["....", "....", "....", "...."]);
		const ev = diffBoards(prev, cur, { rows: [1], columns: [] });
		expect(ev.cleared).toEqual([4, 5, 6, 7]);
		expect(ev.lines).toEqual([1]);
	});

	it("sees a column go and keeps the cells of a piece that stayed", () => {
		const prev = board(["#...", "#...", "....", "#..."]);
		const cur = board(["....", "....", "...#", "...#"]);
		const ev = diffBoards(prev, cur, { rows: [], columns: [0] });
		expect(ev.cleared).toEqual([0, 4, 8, 12]);
		expect(ev.placed).toEqual([11, 15]);
		expect(ev.lines).toEqual([1000]);
	});

	it("takes a hover that was only cancelled for no clear and no landing", () => {
		const hovering = board(["b.##", "e...", "....", "...."]);
		const cancelled = board(["#.##", "....", "....", "...."]);
		const ev = diffBoards(hovering, cancelled, null);
		expect(ev.placed).toEqual([]);
		expect(ev.cleared).toEqual([]);
		expect(ev.lines).toEqual([]);
	});

	it("does not take a restart for a clear", () => {
		const ev = diffBoards(board(["####", "####", "####", "####"]), board(["....", "....", "....", "...."]), null);
		expect(ev.cleared).toEqual([]);
	});

	it("reads a plain board of another player: new blocks land, a full row that is empty now went", () => {
		const prev = board(["........", "########", "#.......", "........", "........", "........", "........", "........"]);
		const cur = board(["........", "........", "##......", "........", "........", "........", "........", "........"]);
		const ev = diffBoards(prev, cur);
		expect(ev.cleared).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
		expect(ev.placed).toEqual([17]);
		expect(ev.lines).toEqual([1]);
	});
});

describe("particles", () => {
	const fx: Fx = { m: 0, s: 0, c: ["#ff0000", "*"], n: 3, u: 1, t: 500, d: 1 };

	it("is the same particle for the same seed, on the pixel grid", () => {
		const a = spawnParticle(fx, 100, 100, 40, "#00ff00", { s: 7 }, 0, 3, 1, 0);
		const b = spawnParticle(fx, 100, 100, 40, "#00ff00", { s: 7 }, 0, 3, 1, 0);
		expect(a).toEqual(b);
		const u = pixelUnit(40);
		expect(a.x % u).toBe(0);
		expect(a.y % u).toBe(0);
		expect(a.w).toBe(u);
	});

	it("takes the block's own colour for *", () => {
		const colors = new Set<string>();
		for (let j = 0; j < 30; j++) colors.add(spawnParticle(fx, 0, 0, 40, "#00ff00", { s: j + 1 }, j, 30, 1, 0).col);
		expect([...colors].sort()).toEqual(["#00ff00", "#ff0000"]);
	});

	it("draws each shape from the right pixels", () => {
		const u = pixelUnit(40);
		const plus = spawnParticle({ ...fx, s: S_PLUS }, 0, 0, 40, "#fff", { s: 3 }, 0, 1, 1, 0);
		expect(plus.sh).toContain(`${u}px 0 0 0`);
		const ring = spawnParticle({ ...fx, s: S_RING }, 0, 0, 40, "#fff", { s: 3 }, 0, 1, 1, 0);
		expect([ring.w, ring.h, ring.bw]).toEqual([3 * u, 3 * u, u]);
		const streak = spawnParticle({ ...fx, s: S_STREAK, a: 0 }, 0, 0, 40, "#fff", { s: 3 }, 0, 1, 1, 0);
		expect([streak.w, streak.h]).toEqual([4 * u, u]);
	});

	it("moves every motion to finite places on the pixel grid and ends it hidden or faded", () => {
		for (let m = 0; m <= 15; m++) {
			for (let e = 0; e <= 2; e++) {
				const q = spawnParticle({ ...fx, m, e, g: 1, d: 2 }, 100, 100, 40, "#fff", { s: 99 + m }, 1, 3, 1, 0);
				const u = q.u;
				for (let step = 0; step <= 20; step++) {
					const out = frame();
					fxFrame(q, step / 20, out);
					for (const v of [out.x, out.y, out.a, out.sc]) expect(Number.isFinite(v)).toBe(true);
					expect(Math.abs(out.x % u)).toBe(0);
					expect(Math.abs(out.y % u)).toBe(0);
				}
				const end = frame();
				fxFrame(q, 0.999, end);
				if (e === 0 && m !== M_BLINK) expect(end.a).toBeLessThanOrEqual(0.67);
				if (e === 1 && m !== M_PULSE) expect(end.sc).toBeLessThanOrEqual(0.4);
			}
		}
	});

	it("swells a pulse and hides what is gone", () => {
		const q = spawnParticle({ ...fx, m: M_PULSE, s: S_RING, d: 1.5, e: 2 }, 0, 0, 40, "#fff", { s: 5 }, 0, 1, 1, 0);
		const start = frame();
		const end = frame();
		fxFrame(q, 0.01, start);
		fxFrame(q, 0.99, end);
		expect(end.sc).toBeGreaterThan(start.sc * 2);
		expect(particleStyle(q, 0.5, frame())).toHaveProperty("transform");
		// a fading particle is down to its last step at the end (the view is hidden by its progress reaching 1)
		const fading = spawnParticle({ ...fx, e: 0 }, 0, 0, 40, "#fff", { s: 5 }, 0, 1, 1, 0);
		expect((particleStyle(fading, 0.9999, frame()) as { opacity: number }).opacity).toBeLessThanOrEqual(0.34);
	});
});

describe("beams", () => {
	const beam = { k: 1, c: ["#ffffff", "#000000"], th: 2, t: 500, dir: 0 };

	it("covers the line of a row and of a column", () => {
		const row = spawnBeam(beam, 0, 2, 8, 8, 40, 40, 0, 0);
		expect([row.x, row.y, row.w, row.h]).toEqual([0, 80, 320, 40]);
		const col = spawnBeam(beam, 1, 3, 8, 8, 40, 40, 0, 0);
		expect([col.x, col.y, col.w, col.h]).toEqual([120, 0, 40, 320]);
	});

	it("draws every kind of bar inside its line and hides it before and after", () => {
		for (let k = 1; k <= 6; k++) {
			const b = spawnBeam({ ...beam, k }, 0, 1, 8, 8, 40, 40, 0, 0);
			let seen = 0;
			for (let step = 1; step < 20; step++) {
				const style = beamStyle(b, step / 20) as { left?: number; width?: number; opacity: number };
				if (style.width === undefined) continue;
				seen++;
				expect(style.left!).toBeGreaterThanOrEqual(0);
				expect(style.left! + style.width!).toBeLessThanOrEqual(b.w + 1);
			}
			expect(seen).toBeGreaterThan(3);
			if (k !== 2 && k !== 4) expect(beamStyle(b, 0)).toEqual({ opacity: 0 });
		}
	});
});

describe("planEvents", () => {
	const empty = board(["........", "........", "........", "........", "........", "........", "........", "........"]);
	const full1 = board(["........", "bebbbbbb", "........", "........", "........", "........", "........", "........"]);
	const rowEvents = { placed: [] as number[], cleared: [8, 9, 10, 11, 12, 13, 14, 15], lines: [1] };

	it("turns a placed piece into its place particles", () => {
		const anim = SKIN_ANIMATIONS.piece_minecraft;
		const cur = board(["........", "##......", "........", "........", "........", "........", "........", "........"]);
		const plan = planEvents(anim, { placed: [8, 9], cleared: [], lines: [] }, empty, cur, "piece_minecraft", opts());
		expect(plan.ps).toHaveLength(anim.place.n * 2);
		expect(plan.bs).toHaveLength(0);
		for (const q of plan.ps) expect(q.t).toBeGreaterThan(0);
	});

	it("turns a cleared line into clear particles and a bar", () => {
		const anim = SKIN_ANIMATIONS.piece_lava;
		const plan = planEvents(anim, rowEvents, full1, empty, "piece_lava", opts());
		expect(plan.ps.length).toBeGreaterThanOrEqual(8);
		expect(plan.ps.length).toBeLessThanOrEqual(26);
		expect(plan.bs).toHaveLength(1);
		expect(plan.bs[0].axis).toBe(0);
		expect(plan.bs[0].y).toBe(40);
	});

	it("keeps a big clear within the pool", () => {
		const anim = SKIN_ANIMATIONS.piece_chest_prism;
		const cells = Array.from({ length: 64 }, (_, k) => k);
		const plan = planEvents(anim, { placed: [], cleared: cells, lines: [0, 1, 2, 3, 4, 5, 6, 7] }, full1, empty, "piece_chest_prism", opts(9));
		expect(plan.ps.length).toBeLessThanOrEqual(26 + 22 + 14);
		expect(plan.bs.length).toBeLessThanOrEqual(3);
	});

	it("gives chest skins more particles than the same clear of another skin", () => {
		const chestPlan = planEvents(SKIN_ANIMATIONS.piece_chest_dragon, rowEvents, full1, empty, "piece_chest_dragon", opts(0));
		const plainPlan = planEvents(SKIN_ANIMATIONS.piece_lava_ember, rowEvents, full1, empty, "piece_lava_ember", opts(0));
		expect(chestPlan.ps.length).toBeGreaterThan(plainPlan.ps.length);
	});

	it("grows the combo effect of a chest skin with the combo, and only for chest skins", () => {
		const chestAt = (combo: number) => planEvents(SKIN_ANIMATIONS.piece_chest_toxic, rowEvents, full1, empty, "piece_chest_toxic", opts(combo)).ps.length;
		expect(chestAt(1)).toBe(chestAt(0));
		expect(chestAt(3)).toBeGreaterThan(chestAt(1));
		expect(chestAt(6)).toBeGreaterThan(chestAt(3));
		const plainAt = (combo: number) => planEvents(SKIN_ANIMATIONS.piece_lava_ember, rowEvents, full1, empty, "piece_lava_ember", opts(combo)).ps.length;
		expect(plainAt(6)).toBe(plainAt(0));
	});

	it("does not play a combo show in reduced motion, and halves the rest", () => {
		const at = (combo: number, level: number) => planEvents(SKIN_ANIMATIONS.piece_chest_toxic, rowEvents, full1, empty, "piece_chest_toxic", opts(combo, level)).ps.length;
		expect(at(6, 0.5)).toBe(at(0, 0.5));
		expect(at(6, 0.5)).toBeLessThan(at(6, 1));
	});

	it("is the same plan for the same seed", () => {
		const a = planEvents(SKIN_ANIMATIONS.piece_circuit, rowEvents, full1, empty, "piece_circuit", opts());
		const b = planEvents(SKIN_ANIMATIONS.piece_circuit, rowEvents, full1, empty, "piece_circuit", opts());
		expect(a).toEqual(b);
	});

	it("plans something for every skin", () => {
		for (const id of Object.keys(SKIN_ANIMATIONS)) {
			const plan = planEvents(SKIN_ANIMATIONS[id], rowEvents, full1, empty, id, opts(4));
			expect([id, plan.ps.length > 0]).toEqual([id, true]);
			expect([id, plan.bs.length]).toEqual([id, 1]);
			for (const q of plan.ps) for (const v of [q.x, q.y, q.tx, q.ty]) expect(Number.isFinite(v)).toBe(true);
		}
	});
});

describe("trail and idle shimmer", () => {
	it("leaves a trail particle in the skin's own colours", () => {
		const q = trailParticle(SKIN_ANIMATIONS.piece_crystal_rose, 50, 60, 40, "#112233", 9);
		expect(SKIN_ANIMATIONS.piece_crystal_rose.trail.c).toContain(q.col);
	});

	it("rests on an empty board and sparkles on a block of a full one", () => {
		const anim = SKIN_ANIMATIONS.piece_minecraft_gold;
		const empty = board(["....", "....", "....", "...."]);
		const full = board(["####", "####", "####", "####"]);
		let any = 0;
		for (let ms = 0; ms < 20000; ms += 50) {
			expect(idleSpark(anim.idle, empty, 0, ms, 40, 40, "piece_minecraft_gold")).toBeNull();
			const found = idleSpark(anim.idle, full, 0, ms, 40, 40, "piece_minecraft_gold");
			if (found) {
				any++;
				expect(found.p).toBeGreaterThanOrEqual(0);
				expect(found.p).toBeLessThan(1);
				expect(found.part.x).toBeGreaterThanOrEqual(0);
				expect(found.part.x).toBeLessThanOrEqual(160);
			}
		}
		expect(any).toBeGreaterThan(20);
	});

	it("lights different blocks in different cycles", () => {
		const anim = SKIN_ANIMATIONS.piece_circuit_matrix;
		const full = board(["########", "########", "########", "########", "########", "########", "########", "########"]);
		const spots = new Set<string>();
		for (let cycle = 0; cycle < 12; cycle++) {
			const found = idleSpark(anim.idle, full, 0, cycle * anim.idle.every + 100, 40, 40, "piece_circuit_matrix");
			if (found) spots.add(`${found.part.x},${found.part.y}`);
		}
		expect(spots.size).toBeGreaterThan(3);
	});
});
