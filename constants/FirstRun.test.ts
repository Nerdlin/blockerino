const mockStore = new Map<string, string>();

jest.mock("@react-native-async-storage/async-storage", () => ({
	__esModule: true,
	default: {
		getItem: jest.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
		setItem: jest.fn((key: string, value: string) => {
			mockStore.set(key, value);
			return Promise.resolve();
		}),
	},
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { markFirstRunDone, shouldRunFirstRun } from "./FirstRun";

beforeEach(() => {
	mockStore.clear();
	jest.clearAllMocks();
});

describe("first run", () => {
	it("is a first run on a clean install", async () => {
		expect(await shouldRunFirstRun()).toBe(true);
	});

	it("is not a first run once it was marked done", async () => {
		await markFirstRunDone();
		expect(await shouldRunFirstRun()).toBe(false);
	});

	it("treats an existing player (saved scores or nickname) as not new and remembers it", async () => {
		mockStore.set("HIGH_SCORES", "[]");
		expect(await shouldRunFirstRun()).toBe(false);
		expect(mockStore.get("FIRST_RUN_DONE")).toBe("true");

		mockStore.clear();
		mockStore.set("PLAYER_NAME", "Nerdlin");
		expect(await shouldRunFirstRun()).toBe(false);
	});

	it("does not trap the player when storage fails", async () => {
		(AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error("storage"));
		expect(await shouldRunFirstRun()).toBe(false);
	});
});
