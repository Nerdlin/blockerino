jest.mock("@react-native-async-storage/async-storage", () =>
	require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
const mockRpc = jest.fn();
const mockGetSession = jest.fn();

jest.mock("./Supabase", () => ({
	supabase: {
		rpc: (...args: unknown[]) => mockRpc(...args),
		auth: { getSession: () => mockGetSession() },
	},
}));

import {
	claimDailyReward,
	fetchDailyRewardStatus,
	parseDailyRewardClaim,
	parseDailyRewardStatus,
} from "./DailyReward";

beforeEach(() => {
	mockRpc.mockReset();
	mockGetSession.mockReset();
	mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
});

describe("parseDailyRewardStatus", () => {
	it("reads the server answer", () => {
		expect(parseDailyRewardStatus({ status: "ok", streak: 3, best: 5, claimed_today: false, next_streak: 4, next_reward: 80, coins: 10 }))
			.toMatchObject({ streak: 3, best: 5, claimedToday: false, nextStreak: 4, nextReward: 80 });
	});

	it("rejects anything that is not a complete ok answer", () => {
		expect(parseDailyRewardStatus(null)).toBeNull();
		expect(parseDailyRewardStatus({ status: "no_profile" })).toBeNull();
		expect(parseDailyRewardStatus({ status: "ok", streak: "3" })).toBeNull();
	});
});

describe("parseDailyRewardClaim", () => {
	it("reads a fresh claim", () => {
		expect(parseDailyRewardClaim({ status: "claimed", streak: 2, reward: 60, best: 2, coins: 110, next_reward: 70 }))
			.toMatchObject({ state: "claimed", claim: { streak: 2, reward: 60, best: 2, coins: 110, nextReward: 70 } });
	});

	it("treats an already claimed day as a result without a reward", () => {
		expect(parseDailyRewardClaim({ status: "already", streak: 2, best: 2, coins: 110, next_reward: 70 }))
			.toMatchObject({ state: "already", claim: { streak: 2, reward: 0, best: 2, coins: 110, nextReward: 70 } });
	});

	it("rejects errors", () => {
		expect(parseDailyRewardClaim({ status: "no_profile" })).toBeNull();
		expect(parseDailyRewardClaim(undefined)).toBeNull();
	});
});

describe("server calls", () => {
	it("does not call the server for guests", async () => {
		mockGetSession.mockResolvedValue({ data: { session: null } });
		expect(await fetchDailyRewardStatus()).toBeNull();
		expect(await claimDailyReward()).toBeNull();
		expect(mockRpc).not.toHaveBeenCalled();
	});

	it("returns the parsed status", async () => {
		mockRpc.mockResolvedValue({ data: { status: "ok", streak: 1, best: 1, claimed_today: true, next_streak: 2, next_reward: 60 }, error: null });
		expect(await fetchDailyRewardStatus()).toMatchObject({ streak: 1, best: 1, claimedToday: true, nextStreak: 2, nextReward: 60 });
		expect(mockRpc).toHaveBeenCalledWith("daily_reward_status");
	});

	it("returns null when the call fails or throws", async () => {
		mockRpc.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
		expect(await claimDailyReward()).toBeNull();
		mockRpc.mockRejectedValueOnce(new Error("network"));
		expect(await fetchDailyRewardStatus()).toBeNull();
	});
});

describe("season calendar", () => {
	const { parseDailyRewardStatus, parseDailyRewardClaim, fallbackCalendar } = jest.requireActual("./DailyReward");

	it("reads the calendar and the chest of the next day", () => {
		const status = parseDailyRewardStatus({
			status: "ok", streak: 6, best: 6, claimed_today: false, next_streak: 7, next_reward: 110, next_chest: "small",
			calendar: [{ day: 1, coins: 50, chest: null }, { day: 7, coins: 110, chest: "small" }],
		});
		expect(status).toMatchObject({ nextChest: "small", calendar: [{ day: 1, coins: 50, chest: null }, { day: 7, coins: 110, chest: "small" }] });
	});

	it("an older server without a calendar gets the built-in one", () => {
		const status = parseDailyRewardStatus({ status: "ok", streak: 1, best: 1, claimed_today: true, next_streak: 2, next_reward: 60 });
		expect(status?.calendar).toHaveLength(28);
		expect(status?.nextChest).toBeNull();
		expect(fallbackCalendar()[27]).toEqual({ day: 28, coins: 125, chest: "big" });
		expect(fallbackCalendar()[6]).toEqual({ day: 7, coins: 110, chest: "small" });
	});

	it("reads a chest prize and the owned items", () => {
		const item = parseDailyRewardClaim({ status: "claimed", streak: 28, reward: 125, best: 28, coins: 900, next_reward: 120,
			chest: { size: "big", kind: "item", item_id: "piece_lava", coins: 300, rarity: "epic" }, owned_item_ids: ["piece_classic", "piece_lava"] });
		expect(item?.claim.chest).toEqual({ size: "big", kind: "item", itemId: "piece_lava", coins: 300, rarity: "epic" });
		expect(item?.claim.ownedItemIds).toEqual(["piece_classic", "piece_lava"]);
		const coins = parseDailyRewardClaim({ status: "claimed", streak: 7, reward: 110, best: 7, coins: 900, next_reward: 55, chest: { size: "small", kind: "coins", coins: 420 } });
		expect(coins?.claim.chest).toEqual({ size: "small", kind: "coins", coins: 420, rarity: "common" });
	});
});
