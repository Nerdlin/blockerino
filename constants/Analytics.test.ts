const mockStore = new Map<string, string>();
const mockRpc = jest.fn();
let mockUuid = 0;

jest.mock("@react-native-async-storage/async-storage", () => ({
	__esModule: true,
	default: {
		getItem: jest.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
		setItem: jest.fn((key: string, value: string) => {
			mockStore.set(key, value);
			return Promise.resolve();
		}),
		removeItem: jest.fn((key: string) => {
			mockStore.delete(key);
			return Promise.resolve();
		}),
	},
}));
jest.mock("expo-crypto", () => ({ randomUUID: () => `uuid-${++mockUuid}` }));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "2.0.0" } } }));
jest.mock("./Supabase", () => ({
	supabase: {
		rpc: (...args: unknown[]) => mockRpc(...args),
		auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }) },
	},
}));

import {
	flushAnalytics,
	isAnalyticsEnabled,
	resetAnalyticsForTests,
	sanitizeProps,
	setAnalyticsEnabled,
	track,
} from "./Analytics";

// track() is fire and forget, so let its internal promises finish.
async function settle() {
	for (let i = 0; i < 12; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
	mockStore.clear();
	mockRpc.mockReset();
	mockRpc.mockResolvedValue({ error: null });
	mockUuid = 0;
	resetAnalyticsForTests();
});

describe("sanitizeProps", () => {
	it("keeps small primitives and drops everything else", () => {
		const clean = sanitizeProps({
			mode: "classic",
			score: 120,
			won: true,
			none: null,
			nan: Number.NaN,
			skipped: undefined,
			"Bad Key": "x",
			nested: { a: 1 } as unknown as string,
			long: "y".repeat(500),
		});
		expect(clean).toEqual({ mode: "classic", score: 120, won: true, none: null, long: "y".repeat(100) });
	});

	it("caps the number of props", () => {
		const props: Record<string, number> = {};
		for (let i = 0; i < 30; i += 1) props[`k${i}`] = i;
		expect(Object.keys(sanitizeProps(props))).toHaveLength(12);
	});
});

describe("track and flush", () => {
	it("sends queued events in one batch with a stable device id and session", async () => {
		track("screen_view", { screen: "menu" });
		track("game_start", { mode: "classic" });
		await settle();
		await flushAnalytics();

		expect(mockRpc).toHaveBeenCalledTimes(1);
		const [fn, args] = mockRpc.mock.calls[0];
		expect(fn).toBe("track_events");
		expect(args.p_events).toHaveLength(2);
		expect(args.p_events[0]).toMatchObject({ name: "screen_view", props: { screen: "menu" }, app_version: "2.0.0" });
		expect(args.p_events[0].device_id).toBe(args.p_events[1].device_id);
		expect(args.p_events[0].session_id).toBe(args.p_events[1].session_id);
		expect(mockStore.has("ANALYTICS_QUEUE")).toBe(false);
	});

	it("keeps the queue when the server cannot be reached and sends it later", async () => {
		mockRpc.mockResolvedValueOnce({ error: { message: "offline" } });
		track("game_over", { mode: "classic", score: 100 });
		await settle();
		await flushAnalytics();
		expect(JSON.parse(mockStore.get("ANALYTICS_QUEUE") as string)).toHaveLength(1);

		await flushAnalytics();
		expect(mockRpc).toHaveBeenCalledTimes(2);
		expect(mockStore.has("ANALYTICS_QUEUE")).toBe(false);
	});

	it("sends at most 50 events per call", async () => {
		for (let i = 0; i < 120; i += 1) track("tick");
		await settle();
		await flushAnalytics();
		const sizes = mockRpc.mock.calls.map(([, args]) => args.p_events.length);
		expect(Math.max(...sizes)).toBeLessThanOrEqual(50);
		expect(sizes.reduce((sum, n) => sum + n, 0)).toBe(120);
	});
});

describe("opt out", () => {
	it("sends nothing and forgets the queue once switched off", async () => {
		track("screen_view", { screen: "menu" });
		await settle();
		expect(mockStore.has("ANALYTICS_QUEUE")).toBe(true);

		await setAnalyticsEnabled(false);
		expect(mockStore.has("ANALYTICS_QUEUE")).toBe(false);

		track("screen_view", { screen: "shop" });
		await settle();
		await flushAnalytics();
		expect(mockRpc).not.toHaveBeenCalled();
		expect(await isAnalyticsEnabled()).toBe(false);
	});

	it("is on by default and remembers the choice", async () => {
		expect(await isAnalyticsEnabled()).toBe(true);
		await setAnalyticsEnabled(false);
		resetAnalyticsForTests();
		expect(await isAnalyticsEnabled()).toBe(false);
	});
});
