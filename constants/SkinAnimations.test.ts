import { SHOP_ITEMS } from "./Shop";
import { SKIN_SPRITES } from "./SkinTextures";
import { SKIN_ANIMATIONS, getSkinAnim, type Fx } from "./SkinAnimations";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

const skins = SHOP_ITEMS.filter((item) => item.category === "piece_skin");
const themed = skins.filter((item) => item.id !== "piece_classic");
const chest = themed.filter((item) => item.chestOnly === true);
const plain = themed.filter((item) => item.chestOnly !== true);
const entries = Object.entries(SKIN_ANIMATIONS);

function fxList(anim: (typeof entries)[number][1]): Fx[] {
	return [anim.trail, anim.place, anim.clear, anim.idle.fx, ...(anim.ex ? [anim.ex.place, anim.ex.clear] : []), ...(anim.combo ? [anim.combo.fx] : [])];
}

function duplicates(key: (anim: (typeof entries)[number][1]) => string): string[] {
	const seen = new Map<string, string[]>();
	for (const [id, anim] of entries) seen.set(key(anim), [...(seen.get(key(anim)) ?? []), id]);
	return [...seen.values()].filter((ids) => ids.length > 1).map((ids) => ids.join(" = "));
}

describe("skin animations: one table entry per skin", () => {
	it("has 60 entries, one for every themed piece skin of the shop and nothing else", () => {
		expect(entries).toHaveLength(60);
		expect(themed).toHaveLength(60);
		expect(Object.keys(SKIN_ANIMATIONS).sort()).toEqual(themed.map((item) => item.id).sort());
		expect(Object.keys(SKIN_ANIMATIONS).sort()).toEqual(Object.keys(SKIN_SPRITES).sort());
	});

	it("gives the plain classic block no animation", () => {
		expect(getSkinAnim("piece_classic")).toBeNull();
		expect(getSkinAnim("piece_minecraft")).not.toBeNull();
		expect(getSkinAnim("constructor")).toBeNull();
	});

	it("keeps every parameter in range", () => {
		for (const [id, anim] of entries) {
			for (const fx of fxList(anim)) {
				expect([id, fx.m >= 0 && fx.m <= 15 && Number.isInteger(fx.m)]).toEqual([id, true]);
				expect([id, fx.s >= 0 && fx.s <= 7 && Number.isInteger(fx.s)]).toEqual([id, true]);
				expect([id, fx.n >= 1 && fx.n <= 4]).toEqual([id, true]);
				expect([id, fx.u >= 1 && fx.u <= 3]).toEqual([id, true]);
				expect([id, fx.t >= 300 && fx.t <= 1600]).toEqual([id, true]);
				expect([id, fx.d >= 0 && fx.d <= 4]).toEqual([id, true]);
				expect(fx.c.length).toBeGreaterThan(0);
				for (const color of fx.c) expect(color).toMatch(/^(#[0-9A-Fa-f]{6}|\*)$/);
			}
			expect(anim.beam.k).toBeGreaterThanOrEqual(1);
			expect(anim.beam.k).toBeLessThanOrEqual(6);
			expect(anim.beam.t).toBeGreaterThanOrEqual(300);
			expect(anim.beam.t).toBeLessThanOrEqual(800);
			expect([0, 1, 2]).toContain(anim.beam.dir);
			expect(anim.idle.every).toBeGreaterThan(anim.idle.fx.t);
			expect(anim.idle.k).toBeGreaterThanOrEqual(2);
			expect(anim.idle.k).toBeLessThanOrEqual(4);
		}
	});
});

describe("skin animations: every skin moves its own way", () => {
	it("shares no whole animation between two skins", () => {
		expect(duplicates((anim) => JSON.stringify(anim))).toEqual([]);
	});

	it("gives every skin its own clear effect and its own drag trail", () => {
		expect(duplicates((anim) => `${anim.clear.m}/${anim.clear.s}`)).toEqual([]);
		expect(duplicates((anim) => `${anim.trail.m}/${anim.trail.s}`)).toEqual([]);
	});

	it("gives every skin its own trail, place and clear together, its own colours and its own line bar", () => {
		expect(duplicates((anim) => [anim.trail, anim.place, anim.clear].map((fx) => `${fx.m}/${fx.s}`).join("|"))).toEqual([]);
		expect(duplicates((anim) => `${anim.clear.c.join()}|${anim.place.c.join()}`)).toEqual([]);
		expect(duplicates((anim) => `${anim.beam.k}/${anim.beam.th}/${anim.beam.t}/${anim.beam.dir}/${anim.beam.c.join()}`)).toEqual([]);
		expect(duplicates((anim) => `${anim.idle.fx.m}/${anim.idle.fx.s}/${anim.idle.every}/${anim.idle.fx.c.join()}`)).toEqual([]);
	});

	it("uses a broad mix of motions, shapes and line bars", () => {
		expect(new Set(entries.map(([, anim]) => anim.clear.m)).size).toBeGreaterThanOrEqual(14);
		expect(new Set(entries.map(([, anim]) => anim.clear.s)).size).toBe(8);
		expect(new Set(entries.map(([, anim]) => anim.beam.k)).size).toBe(6);
	});
});

describe("skin animations: chest skins get more", () => {
	it("gives every chest skin extra particles, a combo effect that grows and a livelier shimmer", () => {
		expect(chest.map((item) => item.id).sort()).toEqual(["piece_chest_aurora", "piece_chest_cosmic", "piece_chest_dragon", "piece_chest_prism", "piece_chest_relic", "piece_chest_toxic"]);
		for (const item of chest) {
			const anim = SKIN_ANIMATIONS[item.id];
			expect(anim.ex).toBeDefined();
			expect(anim.combo).toBeDefined();
			expect(anim.combo!.per).toBeGreaterThanOrEqual(1);
			expect(anim.combo!.max).toBeGreaterThan(anim.combo!.base);
			expect(anim.idle.k).toBe(4);
			expect(anim.trail.n).toBeGreaterThanOrEqual(2);
			expect(anim.clear.n + anim.ex!.clear.n).toBeGreaterThanOrEqual(4);
			expect(anim.place.n + anim.ex!.place.n).toBeGreaterThanOrEqual(4);
		}
	});

	it("leaves the extras to the chest skins", () => {
		for (const item of plain) {
			const anim = SKIN_ANIMATIONS[item.id];
			expect(anim.ex).toBeUndefined();
			expect(anim.combo).toBeUndefined();
		}
	});

	it("starts every chest combo effect from a different place or in its own way", () => {
		const looks = chest.map((item) => SKIN_ANIMATIONS[item.id].combo!).map((combo) => `${combo.fx.m}/${combo.fx.s}`);
		expect(new Set(looks).size).toBe(chest.length);
	});
});
