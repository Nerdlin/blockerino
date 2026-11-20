import fs from "fs";
import path from "path";
import { MONTHLY_MILESTONES, claimableMilestones, daysLeftInMonth, monthlyGoal, parseMonthlyQuest } from "./MonthlyQuest";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

describe("monthly quest", () => {
	it("mirrors the milestones of the migration", () => {
		const sql = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20261121100000_monthly_milestones.sql"), "utf8");
		const pick = (name: string) => {
			const body = sql.slice(sql.indexOf(`FUNCTION public.${name}(`));
			return [...body.slice(0, body.indexOf("$$;", 20)).matchAll(/WHEN (\d) THEN (\d+)/g)].map((m) => Number(m[2]));
		};
		expect(pick("monthly_milestone_days")).toEqual(MONTHLY_MILESTONES.map((step) => step.days));
		expect(pick("monthly_milestone_coins")).toEqual(MONTHLY_MILESTONES.map((step) => step.coins));
		expect(pick("monthly_milestone_keys")).toEqual(MONTHLY_MILESTONES.map((step) => step.keys));
	});

	it("reads the server answer and drops what does not fit", () => {
		const state = parseMonthlyQuest({
			status: "ok", month: "2026-11", ends_at: "2026-12-01T00:00:00Z", done: 12, medals: ["2026-10", "x", 5],
			milestones: [{ i: 2, days: 20, coins: 1500, keys: 4, medal: true, claimed: false }, { i: 1, days: 10, coins: 500, keys: 2, medal: false, claimed: true }, { i: "x" }],
		})!;
		expect(state.done).toBe(12);
		expect(state.medals).toEqual(["2026-10"]);
		expect(state.milestones.map((step) => [step.index, step.days, step.claimed])).toEqual([[1, 10, true], [2, 20, false]]);
		expect(monthlyGoal(state)).toBe(20);
		expect(claimableMilestones(state)).toEqual([]);
		expect(claimableMilestones({ ...state, done: 20 }).map((step) => step.index)).toEqual([2]);
		expect(parseMonthlyQuest({ month: "bad" })).toBeNull();
		expect(parseMonthlyQuest(null)).toBeNull();
	});

	it("falls back to the built-in steps when the server sends none", () => {
		const state = parseMonthlyQuest({ month: "2026-11" })!;
		expect(state.milestones.map((step) => step.days)).toEqual([10, 20]);
		expect(claimableMilestones({ ...state, done: 10 }).map((step) => step.index)).toEqual([1]);
	});

	it("pays the steps clearly above the daily rewards of the same days", () => {
		// 20 days of dailies: about 165 coins and a key a day
		const dailyTwenty = 20 * 165;
		const total = MONTHLY_MILESTONES.reduce((sum, step) => sum + step.coins, 0);
		expect(total).toBeGreaterThanOrEqual(dailyTwenty * 0.5);
	});

	it("counts the days left", () => {
		expect(daysLeftInMonth({ endsAt: "2026-12-01T00:00:00Z" }, new Date("2026-11-20T12:00:00Z"))).toBe(11);
		expect(daysLeftInMonth({ endsAt: "" })).toBe(0);
		expect(daysLeftInMonth({ endsAt: "2026-12-01T00:00:00Z" }, new Date("2027-01-01T00:00:00Z"))).toBe(0);
	});
});
