import fs from "fs";
import path from "path";
import { MONTHLY_REWARD, MONTHLY_TARGET, daysLeftInMonth, parseMonthlyQuest } from "./MonthlyQuest";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

describe("monthly quest", () => {
	it("mirrors the target and the reward of the migration", () => {
		const sql = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20261120160000_monthly_quest.sql"), "utf8");
		expect(sql).toContain(`monthly_quest_target() RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT ${MONTHLY_TARGET}; $$`);
		expect(sql).toContain(`monthly_quest_reward() RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT ${MONTHLY_REWARD}; $$`);
	});

	it("reads the server answer and drops what does not fit", () => {
		expect(parseMonthlyQuest({ status: "ok", month: "2026-11", ends_at: "2026-12-01T00:00:00Z", target: 10, reward: 300, done: 4, claimed: false, medals: ["2026-10", "x", 5] })).toEqual({
			month: "2026-11", endsAt: "2026-12-01T00:00:00Z", target: 10, reward: 300, done: 4, claimed: false, medals: ["2026-10"],
		});
		expect(parseMonthlyQuest({ month: "bad" })).toBeNull();
		expect(parseMonthlyQuest(null)).toBeNull();
		expect(parseMonthlyQuest({ month: "2026-11", target: 0 })?.target).toBe(1);
	});

	it("counts the days left", () => {
		expect(daysLeftInMonth({ endsAt: "2026-12-01T00:00:00Z" }, new Date("2026-11-20T12:00:00Z"))).toBe(11);
		expect(daysLeftInMonth({ endsAt: "" })).toBe(0);
		expect(daysLeftInMonth({ endsAt: "2026-12-01T00:00:00Z" }, new Date("2027-01-01T00:00:00Z"))).toBe(0);
	});
});
