jest.mock("@/constants/Supabase", () => ({ supabase: {} }));

import { INVITE_GAMES, parseGameInvite } from "./GameInvite";

describe("parseGameInvite", () => {
	it("accepts a known game with a short code", () => {
		expect(parseGameInvite({ game: "durak", code: "ab3cd", hostName: "  Nina " })).toEqual({ game: "durak", code: "AB3CD", hostName: "Nina" });
		for (const game of INVITE_GAMES) expect(parseGameInvite({ game, code: "K7M2P", hostName: "x" })?.game).toBe(game);
	});

	it("falls back to a default name and trims long ones", () => {
		expect(parseGameInvite({ game: "tictactoe", code: "K7M2P" })?.hostName).toBe("Player");
		expect(parseGameInvite({ game: "tictactoe", code: "K7M2P", hostName: "N".repeat(60) })?.hostName).toHaveLength(24);
	});

	it("refuses anything else", () => {
		expect(parseGameInvite(null)).toBeNull();
		expect(parseGameInvite("durak")).toBeNull();
		expect(parseGameInvite({ game: "chess", code: "K7M2P" })).toBeNull();
		expect(parseGameInvite({ game: "durak", code: "no" })).toBeNull();
		expect(parseGameInvite({ game: "durak", code: "has space" })).toBeNull();
		expect(parseGameInvite({ game: "durak", code: "<script>" })).toBeNull();
		expect(parseGameInvite({ game: "durak" })).toBeNull();
	});
});
