jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("./Supabase", () => ({ supabase: {} }));

import { remotePieceSkin } from "./RemoteSkin";

describe("an opponent's piece skin", () => {
	it("draws a real piece skin and falls back to classic for anything else", () => {
		expect(remotePieceSkin("piece_lava_ember")).toBe("piece_lava_ember");
		expect(remotePieceSkin("piece_chest_relic")).toBe("piece_chest_relic");
		expect(remotePieceSkin(undefined)).toBe("piece_classic");
		expect(remotePieceSkin("background_ruby")).toBe("piece_classic");
		expect(remotePieceSkin("piece_made_up")).toBe("piece_classic");
	});
});
