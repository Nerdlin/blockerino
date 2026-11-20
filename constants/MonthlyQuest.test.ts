import fs from "fs";
import path from "path";
import { MONTHLY_MILESTONES, claimableMilestones, daysInMonthKey, daysLeftInMonth, isFullMonthStep, monthTheme, monthlyGoal, parseMonthlyQuest } from "./MonthlyQuest";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

describe("monthly quest", () => {
	it("mirrors the milestones of the migration", () => {
		const sql = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20261121100000_monthly_milestones.sql"), "utf8");
		const values = (name: string) => {
			const body = sql.slice(sql.indexOf(`FUNCTION public.${name}(`));
			return [...body.slice(0, body.indexOf("$$;", 20)).matchAll(/WHEN (\d) THEN (\d+)/g)].map((m) => Number(m[2]));
		};
		expect(values("monthly_milestone_coins")).toEqual(MONTHLY_MILESTONES.map((step) => step.coins));
		expect(values("monthly_milestone_keys")).toEqual(MONTHLY_MILESTONES.map((step) => step.keys));
		// 10 and 20 days, then every day of the month
		expect(sql).toContain("WHEN 1 THEN 10 WHEN 2 THEN 20");
		expect(sql).toMatch(/WHEN 3 THEN EXTRACT\(day FROM/);
		expect(MONTHLY_MILESTONES.map((step) => step.days)).toEqual([10, 20, 0]);
		expect(MONTHLY_MILESTONES.filter((step) => step.medal).length).toBe(1);
	});

	it("reads the server answer and drops what does not fit", () => {
		const state = parseMonthlyQuest({
			status: "ok", month: "2026-11", ends_at: "2026-12-01T00:00:00Z", done: 12, medals: ["2026-10", "x", 5],
			milestones: [{ i: 3, days: 30, coins: 2500, keys: 6, medal: false, claimed: false }, { i: 2, days: 20, coins: 1500, keys: 4, medal: true, claimed: false }, { i: 1, days: 10, coins: 500, keys: 2, medal: false, claimed: true }, { i: "x" }],
		})!;
		expect(state.done).toBe(12);
		expect(state.medals).toEqual(["2026-10"]);
		expect(state.milestones.map((step) => [step.index, step.days, step.claimed])).toEqual([[1, 10, true], [2, 20, false], [3, 30, false]]);
		expect(monthlyGoal(state)).toBe(30);
		expect(claimableMilestones(state)).toEqual([]);
		expect(claimableMilestones({ ...state, done: 20 }).map((step) => step.index)).toEqual([2]);
		expect(isFullMonthStep(state.milestones[2], "2026-11")).toBe(true);
		expect(isFullMonthStep(state.milestones[1], "2026-11")).toBe(false);
		expect(parseMonthlyQuest({ month: "bad" })).toBeNull();
		expect(parseMonthlyQuest(null)).toBeNull();
	});

	it("falls back to the built-in steps, the last one as long as the month", () => {
		const nov = parseMonthlyQuest({ month: "2026-11" })!;
		expect(nov.milestones.map((step) => step.days)).toEqual([10, 20, 30]);
		expect(parseMonthlyQuest({ month: "2026-12" })!.milestones[2].days).toBe(31);
		expect(parseMonthlyQuest({ month: "2027-02" })!.milestones[2].days).toBe(28);
		expect(parseMonthlyQuest({ month: "2028-02" })!.milestones[2].days).toBe(29);
		expect(claimableMilestones({ ...nov, done: 10 }).map((step) => step.index)).toEqual([1]);
		expect(daysInMonthKey("2026-11")).toBe(30);
		expect(daysInMonthKey("bad")).toBe(30);
	});

	it("pays the steps clearly above the daily rewards of the same days", () => {
		// 20 days of dailies: about 165 coins a day
		const total = MONTHLY_MILESTONES.reduce((sum, step) => sum + step.coins, 0);
		expect(total).toBeGreaterThanOrEqual(20 * 165);
	});

	it("has a theme for every month, falling back to the fire", () => {
		for (let month = 1; month <= 12; month++) {
			const theme = monthTheme(`2026-${String(month).padStart(2, "0")}`);
			expect(theme.from).toMatch(/^#[0-9A-F]{6}$/i);
			expect(theme.via).toMatch(/^#[0-9A-F]{6}$/i);
			expect(theme.to).toMatch(/^#[0-9A-F]{6}$/i);
			expect(theme.particleColors.length).toBeGreaterThan(1);
		}
		expect(monthTheme("2026-12").particles).toBe("snow");
		expect(monthTheme("2026-11").particles).toBe("ember");
		expect(monthTheme("garbage")).toEqual(monthTheme("2026-11"));
		// no two months share a look
		const looks = new Set(Array.from({ length: 12 }, (_, i) => monthTheme(`2026-${String(i + 1).padStart(2, "0")}`).via));
		expect(looks.size).toBe(12);
	});

	it("counts the days left", () => {
		expect(daysLeftInMonth({ endsAt: "2026-12-01T00:00:00Z" }, new Date("2026-11-20T12:00:00Z"))).toBe(11);
		expect(daysLeftInMonth({ endsAt: "" })).toBe(0);
		expect(daysLeftInMonth({ endsAt: "2026-12-01T00:00:00Z" }, new Date("2027-01-01T00:00:00Z"))).toBe(0);
	});
});
