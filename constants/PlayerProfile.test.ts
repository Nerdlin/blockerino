jest.mock("@react-native-async-storage/async-storage", () => ({
	__esModule: true,
	default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock("./Supabase", () => ({ supabase: { rpc: jest.fn(), auth: { getSession: jest.fn() }, from: jest.fn() } }));

import { mergeGameRecords, emptyGameRecord } from "./GameStats";
import { isProfileVisibility, parsePublicProfile } from "./PlayerProfile";

const open = {
	status: "ok",
	user_id: "u1",
	friend_row_id: null,
	name: "Nina",
	avatar_url: "🙂",
	relation: "none",
	elo: 1100,
	member_since: "2026-05-01T00:00:00Z",
	highscores: { classic: 4200, chaos: 0, time_attack: 12, daily: 0, move_limit: 0 },
	records: { chess: { wins: 5, losses: 2, draws: 1, botWins: 3, botLosses: 0, botDraws: 0 } },
	achievements: [
		{ id: "royal_mint", reward: 10000 },
		{ id: "tycoon", reward: 2500 },
		{ id: "score_myth", reward: 2000 },
		{ id: "extra", reward: 1 },
	],
};

describe("parsePublicProfile", () => {
	it("reads an open profile and keeps the three best achievements", () => {
		const profile = parsePublicProfile(open);
		expect(profile?.status).toBe("ok");
		expect(profile?.name).toBe("Nina");
		expect(profile?.elo).toBe(1100);
		expect(profile?.highScores?.classic).toBe(4200);
		expect(profile?.records.chess.wins).toBe(5);
		expect(profile?.achievements.map((a) => a.id)).toEqual(["royal_mint", "tycoon", "score_myth"]);
	});

	it("a hidden profile has the name and relation but no details", () => {
		const profile = parsePublicProfile({ status: "hidden", name: "Quiet", user_id: "u2", relation: "pending_out", friend_row_id: "f1" });
		expect(profile?.status).toBe("hidden");
		expect(profile?.relation).toBe("pending_out");
		expect(profile?.friendRowId).toBe("f1");
		expect(profile?.elo).toBeNull();
		expect(profile?.highScores).toBeNull();
		expect(profile?.achievements).toEqual([]);
	});

	it("refuses anything that is not an answer of the function", () => {
		expect(parsePublicProfile(null)).toBeNull();
		expect(parsePublicProfile("ok")).toBeNull();
		expect(parsePublicProfile({ status: "not_found" })).toBeNull();
		expect(parsePublicProfile({ status: "ok" })).toBeNull();
	});

	it("an unknown relation falls back to none", () => {
		expect(parsePublicProfile({ status: "ok", name: "X", relation: "stalker" })?.relation).toBe("none");
	});
});

describe("visibility values", () => {
	it("accepts exactly the three settings", () => {
		expect(["everyone", "friends", "nobody"].every(isProfileVisibility)).toBe(true);
		expect(isProfileVisibility("public")).toBe(false);
		expect(isProfileVisibility(null)).toBe(false);
	});
});

describe("mergeGameRecords", () => {
	it("takes the larger counter, so a sync never lowers a record", () => {
		const device = { chess: { ...emptyGameRecord(), wins: 2, losses: 9 } };
		const account = { chess: { ...emptyGameRecord(), wins: 5, losses: 1 }, durak: { ...emptyGameRecord(), draws: 3 } };
		const merged = mergeGameRecords(device, account);
		expect(merged.chess.wins).toBe(5);
		expect(merged.chess.losses).toBe(9);
		expect(merged.durak.draws).toBe(3);
	});
});
