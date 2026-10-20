import AsyncStorage from "@react-native-async-storage/async-storage";
import { GameModeType } from "@/hooks/useAppState";
import {
	flushPendingGlobalHighScores,
	queueGlobalHighScore,
	flushPendingVersusReports,
	getPendingGlobalHighScores,
	getPendingVersusReports,
	reportVersusResultOrQueue,
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
	it('preserves a higher score queued while a flush is in flight', async () => {
		await AsyncStorage.clear();
		await queueGlobalHighScore('Race', 100, 'classic');
		let release!: (value: boolean) => void;
		let started!: () => void;
		const entered = new Promise<void>(resolve => { started = resolve; });
		const flushing = flushPendingGlobalHighScores(() => { started(); return new Promise(resolve => { release = resolve; }); });
		await entered;
		const queued = queueGlobalHighScore('Race', 200, 'classic');
		release(true);
		await Promise.all([flushing, queued]);
		expect((await getPendingGlobalHighScores()).map(entry => entry.score)).toEqual([200]);
	});
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

	it("keeps a failed versus report once per room until it can be sent", async () => {
		const submitter = jest.fn().mockResolvedValue(null);

		const first = await reportVersusResultOrQueue("room-1", "win", submitter);
		await reportVersusResultOrQueue("room-1", "loss", submitter);
		await reportVersusResultOrQueue("room-2", "loss", submitter);

		const pending = await getPendingVersusReports();

		expect(first.state).toBe("queued");
		expect(pending).toHaveLength(2);
		expect(pending.find((entry) => entry.roomId === "room-1")?.result).toBe("win");
		expect(pending.find((entry) => entry.roomId === "room-2")?.result).toBe("loss");
	});

	it("does not queue a versus report the server accepted", async () => {
		const submitter = jest.fn().mockResolvedValue({ status: "pending", elo: 40 });

		const result = await reportVersusResultOrQueue("room-1", "win", submitter);

		expect(result.state).toBe("synced");
		expect(result.outcome?.elo).toBe(40);
		expect(await getPendingVersusReports()).toEqual([]);
	});

	it("flushes accepted versus reports and keeps the ones that still fail", async () => {
		await reportVersusResultOrQueue("room-1", "win", jest.fn().mockResolvedValue(null));
		await reportVersusResultOrQueue("room-2", "loss", jest.fn().mockResolvedValue(null));

		const flushSubmitter = jest
			.fn()
			.mockImplementation((roomId: string) =>
				Promise.resolve(roomId === "room-1" ? { status: "p1_win", elo: 60 } : null)
			);

		const result = await flushPendingVersusReports(flushSubmitter);
		const pending = await getPendingVersusReports();

		expect(result.synced).toBe(1);
		expect(result.remaining).toBe(1);
		expect(pending).toHaveLength(1);
		expect(pending[0].roomId).toBe("room-2");
	});
});
