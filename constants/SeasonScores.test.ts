import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	flushPendingSeasonScores,
	getPendingSeasonScores,
	getSeasonBoard,
	getSeasonEndsAt,
	getSeasonKey,
	submitSeasonScoreOrQueue,
} from "./SeasonScores";

jest.mock("./Supabase", () => ({ supabase: {} }));

jest.mock("@react-native-async-storage/async-storage", () => {
	const store = new Map<string, string>();

	return {
		__esModule: true,
		default: {
			getItem: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
			setItem: jest.fn((key: string, value: string) => {
				store.set(key, value);
				return Promise.resolve();
			}),
			removeItem: jest.fn((key: string) => {
				store.delete(key);
				return Promise.resolve();
			}),
			clear: jest.fn(() => {
				store.clear();
				return Promise.resolve();
			}),
		},
	};
});

describe("season keys", () => {
	it("uses the UTC calendar month", () => {
		expect(getSeasonKey(new Date("2026-10-16T12:00:00Z"))).toBe("2026-10");
		expect(getSeasonKey(new Date("2026-10-31T23:59:59Z"))).toBe("2026-10");
		expect(getSeasonKey(new Date("2026-11-01T00:00:00Z"))).toBe("2026-11");
	});

	it("ends a season at the first instant of the next month, across the year boundary", () => {
		expect(getSeasonEndsAt(new Date("2026-10-16T12:00:00Z")).toISOString()).toBe("2026-11-01T00:00:00.000Z");
		expect(getSeasonEndsAt(new Date("2026-12-31T23:00:00Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
	});

	it("only Classic and Chaos have a season board", () => {
		expect(getSeasonBoard("classic")).toBe("classic");
		expect(getSeasonBoard("chaos")).toBe("chaos");
		expect(getSeasonBoard("daily_puzzle")).toBeNull();
		expect(getSeasonBoard("time_attack")).toBeNull();
	});
});

describe("season score queue", () => {
	beforeEach(async () => {
		jest.clearAllMocks();
		await AsyncStorage.clear();
	});

	it("submits straight away when online", async () => {
		const submit = jest.fn().mockResolvedValue(true);
		await expect(submitSeasonScoreOrQueue("classic", 500, "u1", 1000, submit)).resolves.toBe("synced");
		expect(submit).toHaveBeenCalledWith("classic", 500, 1000);
		expect(await getPendingSeasonScores()).toEqual([]);
	});

	it("skips modes without a season board and invalid scores", async () => {
		const submit = jest.fn();
		await expect(submitSeasonScoreOrQueue("daily_puzzle", 500, "u1", 1000, submit)).resolves.toBe("skipped");
		await expect(submitSeasonScoreOrQueue("classic", 0, "u1", 1000, submit)).resolves.toBe("skipped");
		expect(submit).not.toHaveBeenCalled();
	});

	it("keeps only the best queued score per user, board and season", async () => {
		const offline = jest.fn().mockRejectedValue(new Error("offline"));
		const jan = Date.UTC(2026, 9, 5);
		await submitSeasonScoreOrQueue("classic", 100, "u1", jan, offline);
		await submitSeasonScoreOrQueue("classic", 300, "u1", jan + 1000, offline);
		await submitSeasonScoreOrQueue("classic", 200, "u1", jan + 2000, offline);
		await submitSeasonScoreOrQueue("chaos", 50, "u1", jan, offline);

		const pending = await getPendingSeasonScores();
		expect(pending.map((entry) => [entry.board, entry.score, entry.achievedAt])).toEqual([
			["classic", 300, jan + 1000],
			["chaos", 50, jan],
		]);
	});

	it("flushes the signed-in user's runs and keeps other users' runs", async () => {
		const offline = jest.fn().mockResolvedValue(false);
		const when = Date.UTC(2026, 9, 5);
		await submitSeasonScoreOrQueue("classic", 100, "u1", when, offline);
		await submitSeasonScoreOrQueue("classic", 200, "u2", when, offline);

		const submit = jest.fn().mockResolvedValue(true);
		const result = await flushPendingSeasonScores("u1", submit, new Date("2026-10-20T00:00:00Z"));

		expect(result).toEqual({ synced: 1, remaining: 1 });
		expect(submit).toHaveBeenCalledWith("classic", 100, when);
		expect((await getPendingSeasonScores()).map((entry) => entry.ownerUserId)).toEqual(["u2"]);
	});

	it("drops queued runs of a closed season instead of retrying forever", async () => {
		const offline = jest.fn().mockResolvedValue(false);
		await submitSeasonScoreOrQueue("classic", 100, "u1", Date.UTC(2026, 8, 28), offline);

		const submit = jest.fn();
		const result = await flushPendingSeasonScores("u1", submit, new Date("2026-10-02T00:00:00Z"));

		expect(result).toEqual({ synced: 0, remaining: 0 });
		expect(submit).not.toHaveBeenCalled();
	});

	it("keeps a run queued when the server rejects it", async () => {
		const offline = jest.fn().mockResolvedValue(false);
		const when = Date.UTC(2026, 9, 5);
		await submitSeasonScoreOrQueue("classic", 100, "u1", when, offline);

		const submit = jest.fn().mockRejectedValue(new Error("network"));
		const result = await flushPendingSeasonScores("u1", submit, new Date("2026-10-20T00:00:00Z"));
		expect(result).toEqual({ synced: 0, remaining: 1 });
	});
});
