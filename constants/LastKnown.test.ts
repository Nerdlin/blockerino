jest.mock("@react-native-async-storage/async-storage", () =>
	require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { ageLabel, loadLastKnown, saveLastKnown } from "./LastKnown";

describe("ageLabel", () => {
	const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();

	it("says the time for today", () => {
		expect(ageLabel(at(2026, 11, 23, 9, 5), at(2026, 11, 23, 20))).toEqual({ key: "offline.saved.today", time: "09:05" });
	});

	it("says yesterday across midnight, even a few minutes apart", () => {
		expect(ageLabel(at(2026, 11, 22, 23, 59), at(2026, 11, 23, 0, 1))).toEqual({ key: "offline.saved.yesterday" });
	});

	it("gives a date for older data", () => {
		expect(ageLabel(at(2026, 11, 3), at(2026, 11, 23))).toEqual({ key: "offline.saved.date", date: "03.11" });
	});
});

describe("saveLastKnown / loadLastKnown", () => {
	it("round-trips a value with its time and returns null for nothing", async () => {
		expect(await loadLastKnown("nothing")).toBeNull();
		await saveLastKnown("board", [{ name: "a", score: 5 }]);
		const loaded = await loadLastKnown<{ name: string; score: number }[]>("board");
		expect(loaded?.value).toEqual([{ name: "a", score: 5 }]);
		expect(typeof loaded?.savedAt).toBe("number");
	});
});
