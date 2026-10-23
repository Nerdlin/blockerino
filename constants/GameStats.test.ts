jest.mock("@react-native-async-storage/async-storage", () =>
	require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import AsyncStorage from "@react-native-async-storage/async-storage";
import { addOutcome, emptyGameRecord, gamesPlayed, getGameRecords, parseGameRecords, recordGameOutcome } from "./GameStats";

beforeEach(async () => {
	await AsyncStorage.clear();
});

describe("game records", () => {
	it("keeps bot results apart from human ones", () => {
		let record = emptyGameRecord();
		record = addOutcome(record, "win", false);
		record = addOutcome(record, "win", true);
		record = addOutcome(record, "loss", true);
		record = addOutcome(record, "draw", false);
		expect(record).toEqual({ wins: 1, losses: 0, draws: 1, botWins: 1, botLosses: 1, botDraws: 0 });
		expect(gamesPlayed(record)).toBe(4);
	});

	it("stores results per game and reads them back in order", async () => {
		recordGameOutcome("chess", "win", { vsBot: true });
		recordGameOutcome("chess", "loss");
		recordGameOutcome("durak", "draw");
		const records = await getGameRecords();
		expect(records.chess).toMatchObject({ botWins: 1, losses: 1 });
		expect(records.durak?.draws).toBe(1);
	});

	it("ignores damaged storage", () => {
		expect(parseGameRecords("not json")).toEqual({});
		expect(parseGameRecords(JSON.stringify({ chess: { wins: "x", losses: -3, draws: 2.9 } })).chess).toEqual({ ...emptyGameRecord(), draws: 2 });
	});
});
