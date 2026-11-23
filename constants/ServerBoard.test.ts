jest.mock("@react-native-async-storage/async-storage", () => ({ __esModule: true, default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }));
jest.mock("./Supabase", () => ({ supabase: { rpc: jest.fn(), auth: {} } }));
jest.mock("./SeasonScores", () => ({ getSeasonBoard: (mode: string) => (mode === "classic" || mode === "chaos" ? mode : null) }));

import {
	buildServerBoardView,
	getServerBoardGuild,
	isValidGuildId,
	parseServerBoardRows,
	serverBoardToScores,
	setServerBoardGuild,
	submitGuildScore,
} from "./ServerBoard";

const rows = parseServerBoardRows([
	{ rank: 1, player_name: "A", avatar_url: null, score: 900, is_me: false },
	{ rank: 2, player_name: "B", avatar_url: "http://x/y.png", score: 700, is_me: false },
	{ rank: 14, player_name: "C", avatar_url: null, score: 300, is_me: false },
	{ rank: 15, player_name: "Me", avatar_url: null, score: 250, is_me: true },
]);

describe("guild id", () => {
	it("accepts only a Discord snowflake shape", () => {
		expect(isValidGuildId("1234567890123456789")).toBe(true);
		expect(isValidGuildId("1234")).toBe(false);
		expect(isValidGuildId("12a4567")).toBe(false);
		expect(isValidGuildId(null)).toBe(false);
		setServerBoardGuild("1234567890");
		expect(getServerBoardGuild()).toBe("1234567890");
		setServerBoardGuild("nope");
		expect(getServerBoardGuild()).toBeNull();
	});
});

describe("buildServerBoardView", () => {
	it("shows the top, the place of the player outside it and the gap to the next place", () => {
		const view = buildServerBoardView(rows);
		expect(view.top.map((row) => row.rank)).toEqual([1, 2]);
		expect(view.myRank).toBe(15);
		expect(view.myScore).toBe(250);
		expect(view.gap).toEqual({ points: 50, place: 14 });
	});

	it("has no gap for the leader and no place for a player who is not on the table", () => {
		const leader = buildServerBoardView(parseServerBoardRows([{ rank: 1, player_name: "Me", score: 10, is_me: true }]));
		expect(leader).toMatchObject({ myRank: 1, gap: null });
		const absent = buildServerBoardView(rows.filter((row) => !row.is_me));
		expect(absent).toMatchObject({ myRank: null, myScore: null, gap: null });
	});

	it("turns the top into plain scores for the shared list", () => {
		const scores = serverBoardToScores(buildServerBoardView(rows), "classic");
		expect(scores).toEqual([
			{ player_name: "A", score: 900, game_mode: "classic", avatar_url: undefined },
			{ player_name: "B", score: 700, game_mode: "classic", avatar_url: "http://x/y.png" },
		]);
	});
});

describe("parseServerBoardRows", () => {
	it("drops broken rows and sorts by place", () => {
		const parsed = parseServerBoardRows([{ rank: 3, score: 1 }, { rank: "x", score: 2 }, null, { rank: 1, score: 5, player_name: "" }]);
		expect(parsed.map((row) => row.rank)).toEqual([1, 3]);
		expect(parsed[0].player_name).toBe("Player");
		expect(parseServerBoardRows("junk")).toEqual([]);
	});
});

describe("submitGuildScore", () => {
	it("sends Classic and Chaos runs when played in a server, and nothing otherwise", async () => {
		const submit = jest.fn().mockResolvedValue(true);
		setServerBoardGuild(null);
		expect(await submitGuildScore("classic", 100, submit)).toBe(false);
		setServerBoardGuild("1234567890");
		expect(await submitGuildScore("classic", 100, submit)).toBe(true);
		expect(submit).toHaveBeenCalledWith("1234567890", "classic", 100);
		expect(await submitGuildScore("time_attack", 100, submit)).toBe(false);
		expect(await submitGuildScore("chaos", 0, submit)).toBe(false);
		expect(submit).toHaveBeenCalledTimes(1);
	});

	it("never throws", async () => {
		setServerBoardGuild("1234567890");
		expect(await submitGuildScore("chaos", 50, jest.fn().mockRejectedValue(new Error("offline")))).toBe(false);
	});
});
