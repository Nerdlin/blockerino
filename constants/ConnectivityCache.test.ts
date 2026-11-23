import { createConnectivityCache } from "./ConnectivityCache";

function setup(answers: Array<boolean | "throw">) {
	let time = 1000;
	const probe = jest.fn(async () => {
		const next = answers.shift();
		if (next === "throw") throw new Error("boom");
		return next ?? false;
	});
	const cache = createConnectivityCache(probe, { onlineTtlMs: 20000, offlineTtlMs: 3000, now: () => time });
	return { cache, probe, advance: (ms: number) => (time += ms) };
}

describe("createConnectivityCache", () => {
	it("starts unknown", () => {
		expect(setup([]).cache.peek()).toBeNull();
	});

	it("reuses a fresh answer instead of probing again", async () => {
		const { cache, probe, advance } = setup([true]);
		expect(await cache.check()).toBe(true);
		advance(19000);
		expect(await cache.check()).toBe(true);
		expect(probe).toHaveBeenCalledTimes(1);
	});

	it("trusts 'offline' only briefly, so coming back online is noticed", async () => {
		const { cache, probe, advance } = setup([false, true]);
		expect(await cache.check()).toBe(false);
		advance(2000);
		expect(await cache.check()).toBe(false);
		expect(probe).toHaveBeenCalledTimes(1);
		advance(1500);
		expect(await cache.check()).toBe(true);
		expect(probe).toHaveBeenCalledTimes(2);
	});

	it("shares one probe between simultaneous callers", async () => {
		const { cache, probe } = setup([true]);
		const [a, b] = await Promise.all([cache.check(), cache.check()]);
		expect([a, b]).toEqual([true, true]);
		expect(probe).toHaveBeenCalledTimes(1);
	});

	it("treats a throwing probe as offline and force skips the cache", async () => {
		const { cache, probe } = setup(["throw", true]);
		expect(await cache.check()).toBe(false);
		expect(await cache.check(true)).toBe(true);
		expect(probe).toHaveBeenCalledTimes(2);
	});

	it("notifies subscribers only when the answer changes, and report() updates it", async () => {
		const { cache } = setup([true]);
		const seen: boolean[] = [];
		const stop = cache.subscribe((online) => seen.push(online));
		await cache.check();
		cache.report(true);
		cache.report(false);
		stop();
		cache.report(true);
		expect(seen).toEqual([true, false]);
		expect(cache.peek()).toBe(true);
	});
});
