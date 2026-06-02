import AsyncStorage from "@react-native-async-storage/async-storage";
import { GameModeType } from "@/hooks/useAppState";
import {
	flushPendingGlobalHighScores,
	flushPendingEloRatings,
	getPendingEloRatings,
	getPendingGlobalHighScores,
	submitEloRatingOrQueue,
	submitGlobalHighScoreOrQueue,
} from "./OfflineSync";

jest.mock("@react-native-async-storage/async-storage", () => {
	const store = new Map<string, string>();

	return {
		__esModule: true,
		default: {
			getItem: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
			setItem: jest.fn((key: string, value: string) => {
				store.set(key, value);
				return Promise.resolve();
			}),
			removeItem: jest.fn((key: string) => {
				store.delete(key);
				return Promise.resolve();
			}),
			clear: jest.fn(() => {
				store.clear();
				return Promise.resolve();
			}),
		},
	};
});

describe("offline global score sync", () => {
	beforeEach(async () => {
		jest.clearAllMocks();
		await AsyncStorage.clear();
	});

	it("queues the best offline score per player and game mode", async () => {
		const submitter = jest.fn().mockResolvedValue(false);

		await submitGlobalHighScoreOrQueue("Nerdlin", 120, GameModeType.Classic, submitter);
		await submitGlobalHighScoreOrQueue("Nerdlin", 90, GameModeType.Classic, submitter);
		await submitGlobalHighScoreOrQueue("Nerdlin", 240, GameModeType.Classic, submitter);
		await submitGlobalHighScoreOrQueue("Nerdlin", 40, GameModeType.Chaos, submitter);

		const pending = await getPendingGlobalHighScores();

		expect(pending).toHaveLength(2);
		expect(pending.find((entry) => entry.gameMode === GameModeType.Classic)?.score).toBe(240);
		expect(pending.find((entry) => entry.gameMode === GameModeType.Chaos)?.score).toBe(40);
	});

	it("flushes synced scores and keeps entries that still fail", async () => {
		const submitter = jest
			.fn()
			.mockResolvedValueOnce(false)
			.mockResolvedValueOnce(false);

		await submitGlobalHighScoreOrQueue("Nerdlin", 120, GameModeType.Classic, submitter);
		await submitGlobalHighScoreOrQueue("Alctraz", 200, GameModeType.Chaos, submitter);

		const flushSubmitter = jest
			.fn()
			.mockImplementation((_name: string, _score: number, mode: string) => Promise.resolve(mode === GameModeType.Classic));

		const result = await flushPendingGlobalHighScores(flushSubmitter);
		const pending = await getPendingGlobalHighScores();

		expect(result.synced).toBe(1);
		expect(result.remaining).toBe(1);
		expect(pending).toHaveLength(1);
		expect(pending[0].gameMode).toBe(GameModeType.Chaos);
	});

	it("does not queue invalid offline scores", async () => {
		const submitter = jest.fn().mockResolvedValue(false);

		await submitGlobalHighScoreOrQueue("", 120, GameModeType.Classic, submitter);
		await submitGlobalHighScoreOrQueue("Nerdlin", 0, GameModeType.Classic, submitter);

		expect(await getPendingGlobalHighScores()).toEqual([]);
	});

	it("queues the latest offline ELO value per player", async () => {
		const submitter = jest.fn().mockResolvedValue(false);

		await submitEloRatingOrQueue("Nerdlin", 1010, submitter);
		await submitEloRatingOrQueue("Nerdlin", 990, submitter);
		await submitEloRatingOrQueue("Alctraz", 1200, submitter);

		const pending = await getPendingEloRatings();

		expect(pending).toHaveLength(2);
		expect(pending.find((entry) => entry.playerName === "Nerdlin")?.elo).toBe(990);
		expect(pending.find((entry) => entry.playerName === "Alctraz")?.elo).toBe(1200);
	});

	it("flushes synced ELO ratings and keeps entries that still fail", async () => {
		const submitter = jest.fn().mockResolvedValue(false);

		await submitEloRatingOrQueue("Nerdlin", 1010, submitter);
		await submitEloRatingOrQueue("Alctraz", 1200, submitter);

		const flushSubmitter = jest
			.fn()
			.mockImplementation((name: string) => Promise.resolve(name === "Nerdlin"));

		const result = await flushPendingEloRatings(flushSubmitter);
		const pending = await getPendingEloRatings();

		expect(result.synced).toBe(1);
		expect(result.remaining).toBe(1);
		expect(pending).toHaveLength(1);
		expect(pending[0].playerName).toBe("Alctraz");
	});
});
