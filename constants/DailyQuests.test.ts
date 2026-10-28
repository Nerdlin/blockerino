const mockRpc = jest.fn();
const mockGetSession = jest.fn();

jest.mock("@react-native-async-storage/async-storage", () =>
	require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("./Supabase", () => ({
	supabase: {
		rpc: (...args: unknown[]) => mockRpc(...args),
		auth: { getSession: () => mockGetSession() },
	},
}));

import fs from "fs";
import path from "path";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	BONUS_QUEST_ID,
	BONUS_REWARD,
	QUEST_POOL,
	buildQuestView,
	claimDailyQuests,
	getDailyQuests,
	parseQuestClaim,
	pickDailyQuests,
	questDayKey,
	recordQuestProgress,
} from "./DailyQuests";

beforeEach(async () => {
	mockRpc.mockReset();
	mockGetSession.mockReset();
	await AsyncStorage.clear();
});

describe("picking quests", () => {
	it("gives the same three different kinds for the same day, at least one playable alone", () => {
		for (let d = 1; d <= 60; d++) {
			const day = `2026-11-${String((d % 28) + 1).padStart(2, "0")}-${d}`;
			const quests = pickDailyQuests(day);
			expect(quests).toEqual(pickDailyQuests(day));
			expect(quests).toHaveLength(3);
			expect(new Set(quests.map((quest) => quest.kind)).size).toBe(3);
			expect(quests.some((quest) => ["lines", "games", "pieces"].includes(quest.kind))).toBe(true);
		}
	});

	it("changes from day to day", () => {
		const seen = new Set<string>();
		for (let d = 1; d <= 28; d++) seen.add(pickDailyQuests(`2026-11-${String(d).padStart(2, "0")}`).map((quest) => quest.id).join());
		expect(seen.size).toBeGreaterThan(20);
	});

	it("keeps duels rare and never repeats a kind in one day", () => {
		let versusDays = 0;
		for (let d = 0; d < 300; d++) {
			const day = new Date(2027, 0, 1 + d);
			const quests = pickDailyQuests(questDayKey(day));
			if (quests.some((quest) => quest.kind === "versus")) versusDays++;
			expect(new Set(quests.map((quest) => quest.kind)).size).toBe(3);
		}
		expect(versusDays).toBeLessThan(75);
	});

	it("formats the local day", () => {
		expect(questDayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
	});
});

describe("database rewards", () => {
	it("match the pool and the bonus", () => {
		// the newest migration that defines the reward table wins (the pool grows by replacing the function)
		const dir = path.join(__dirname, "..", "supabase", "migrations");
		const file = fs.readdirSync(dir).filter((name) => fs.readFileSync(path.join(dir, name), "utf8").includes("FUNCTION public.daily_quest_reward")).sort().pop()!;
		const sql = fs.readFileSync(path.join(dir, file), "utf8");
		const from = sql.indexOf("FUNCTION public.daily_quest_reward");
		const body = sql.slice(from, sql.indexOf("FUNCTION public.claim_daily_quests", from) > 0 ? sql.indexOf("FUNCTION public.claim_daily_quests", from) : undefined);
		const rewards = new Map([...body.matchAll(/WHEN '([A-Za-z_0-9]+)' THEN (\d+)/g)].map((match) => [match[1], Number(match[2])]));
		expect(rewards.size).toBe(QUEST_POOL.length + 1);
		for (const quest of QUEST_POOL) expect(rewards.get(quest.id)).toBe(quest.reward);
		expect(rewards.get(BONUS_QUEST_ID)).toBe(BONUS_REWARD);
	});
});

describe("progress", () => {
	it("counts what was recorded today and caps at the target", async () => {
		const day = questDayKey();
		const quests = pickDailyQuests(day);
		const first = quests[0];
		recordQuestProgress(first.kind, first.target + 5);
		const view = await getDailyQuests();
		const row = view.quests.find((quest) => quest.id === first.id)!;
		expect(row.current).toBe(first.target);
		expect(row.complete).toBe(true);
		expect(view.claimableIds).toContain(first.id);
		expect(view.bonusReady).toBe(false);
	});

	it("opens the bonus once all three are done and it was not claimed", () => {
		const day = "2026-11-03";
		const progress = Object.fromEntries(pickDailyQuests(day).map((quest) => [quest.kind, quest.target]));
		const view = buildQuestView({ day, progress, claimed: [] });
		expect(view.bonusReady).toBe(true);
		expect(view.claimableIds).toContain(BONUS_QUEST_ID);
		expect(view.claimableCoins).toBe(pickDailyQuests(day).reduce((sum, quest) => sum + quest.reward, 0) + BONUS_REWARD);
		const claimed = buildQuestView({ day, progress, claimed: [...pickDailyQuests(day).map((quest) => quest.id), BONUS_QUEST_ID] });
		expect(claimed.claimableIds).toEqual([]);
		expect(claimed.bonusClaimed).toBe(true);
	});

	it("starts empty on a new day", async () => {
		await AsyncStorage.setItem("DAILY_QUESTS_STATE", JSON.stringify({ day: "2020-01-01", progress: { lines: 99 }, claimed: ["lines_15"] }));
		const view = await getDailyQuests();
		expect(view.quests.every((quest) => quest.current === 0 && !quest.claimed)).toBe(true);
	});
});

describe("claimDailyQuests", () => {
	it("returns null for guests without calling the server", async () => {
		mockGetSession.mockResolvedValue({ data: { session: null } });
		expect(await claimDailyQuests("2026-11-03", ["lines_15"])).toBeNull();
		expect(mockRpc).not.toHaveBeenCalled();
	});

	it("sends the day and ids and remembers what the server says is claimed", async () => {
		const day = questDayKey();
		mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u" } } } });
		mockRpc.mockResolvedValue({ data: { status: "ok", coins: 120, granted: ["lines_15"], claimed: ["lines_15"] }, error: null });
		const result = await claimDailyQuests(day, ["lines_15"]);
		expect(mockRpc).toHaveBeenCalledWith("claim_daily_quests", { p_day: day, p_ids: ["lines_15"] });
		expect(result).toEqual({ coins: 120, granted: ["lines_15"], claimed: ["lines_15"] });
		expect(JSON.parse((await AsyncStorage.getItem("DAILY_QUESTS_STATE"))!).claimed).toEqual(["lines_15"]);
	});

	it("returns null on errors and answers that are not ok", async () => {
		mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u" } } } });
		mockRpc.mockResolvedValue({ data: null, error: { message: "offline" } });
		expect(await claimDailyQuests("2026-11-03", ["lines_15"])).toBeNull();
		expect(parseQuestClaim({ status: "bad_day" })).toBeNull();
	});
});
