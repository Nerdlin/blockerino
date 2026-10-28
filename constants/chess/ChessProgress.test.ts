jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadChessProgress, parseProgress, recordBotGame, rememberTimeControl } from "./ChessProgress";

beforeEach(async () => {
	await AsyncStorage.clear();
});

describe("chess progress", () => {
	it("starts empty and survives garbage", async () => {
		expect(await loadChessProgress()).toEqual({ beatenBots: [], form: [], lastTimeControl: null });
		expect(parseProgress("nonsense")).toEqual({ beatenBots: [], form: [], lastTimeControl: null });
		expect(parseProgress({ beatenBots: ["pip", "ghost", 7, "pip"], form: ["W", "X", "L"], lastTimeControl: 5 })).toEqual({
			beatenBots: ["pip"],
			form: ["W", "L"],
			lastTimeControl: null,
		});
	});

	it("remembers a beaten bot once and keeps the form of the last ten games", async () => {
		await recordBotGame("pip", "W");
		let progress = await recordBotGame("pip", "W");
		expect(progress.beatenBots).toEqual(["pip"]);
		await recordBotGame("dot", "L");
		for (let i = 0; i < 12; i++) progress = await recordBotGame("dot", "D");
		expect(progress.beatenBots).toEqual(["pip"]);
		expect(progress.form).toHaveLength(10);
		expect(progress.form.every((result) => result === "D")).toBe(true);
		expect((await loadChessProgress()).beatenBots).toEqual(["pip"]);
	});

	it("does not treat a win over the adaptive bot as unlocking anything", async () => {
		const progress = await recordBotGame("echo", "W");
		expect(progress.beatenBots).toEqual([]);
		expect(progress.form).toEqual(["W"]);
	});

	it("remembers the time control without losing the rest", async () => {
		await recordBotGame("pip", "W");
		await rememberTimeControl("180+2");
		expect(await loadChessProgress()).toEqual({ beatenBots: ["pip"], form: ["W"], lastTimeControl: "180+2" });
	});
});
