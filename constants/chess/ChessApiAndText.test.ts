jest.mock("@/constants/Supabase", () => ({ supabase: { rpc: jest.fn(), auth: { getSession: jest.fn() } } }));

import { chess } from "../i18n/chess";
import { parseQuickMatch, parseRatings, parseReport } from "./ChessRatingsApi";
import { TIME_CLASSES } from "./TimeControls";
import { CHESS_BOTS } from "./BotRoster";

describe("rating rows from the server", () => {
	it("maps rows by time class and ignores anything odd", () => {
		expect(
			parseRatings([
				{ time_class: "blitz", rating: 1020, games_played: 3 },
				{ time_class: "rapid", rating: "high", games_played: 3 },
				{ time_class: "hyper", rating: 1500, games_played: 9 },
				null,
				7,
			])
		).toEqual({ bullet: null, blitz: { rating: 1020, games: 3 }, rapid: null });
		expect(parseRatings(null)).toEqual({ bullet: null, blitz: null, rapid: null });
	});

	it("reads a report answer and falls back to failed", () => {
		expect(parseReport({ status: "applied", before: 1000, after: 1020 })).toEqual({ status: "applied", before: 1000, after: 1020 });
		expect(parseReport({ status: "pending" })).toEqual({ status: "pending", before: undefined, after: undefined });
		expect(parseReport({ status: "weird" }).status).toBe("failed");
		expect(parseReport(undefined).status).toBe("failed");
	});
});

describe("quick match answers", () => {
	it("reads a match, a wait and the problems", () => {
		expect(parseQuickMatch({ status: "matched", code: "abc12345", color: "w", opponent: "ben", control: "180+2" })).toEqual({ status: "matched", code: "ABC12345", color: "w", opponent: "ben", control: "180+2" });
		expect(parseQuickMatch({ status: "searching", waited: 7 })).toEqual({ status: "searching", waited: 7 });
		expect(parseQuickMatch({ status: "searching" })).toEqual({ status: "searching", waited: 0 });
		expect(parseQuickMatch({ status: "unauthenticated" }).status).toBe("unauthenticated");
		expect(parseQuickMatch({ status: "no_profile" }).status).toBe("no_profile");
	});

	it("treats a malformed match as a failure", () => {
		expect(parseQuickMatch({ status: "matched", code: "X", color: "green", opponent: "ben", control: "180+2" }).status).toBe("failed");
		expect(parseQuickMatch({ status: "matched", code: 5 }).status).toBe("failed");
		expect(parseQuickMatch(null).status).toBe("failed");
		expect(parseQuickMatch("matched").status).toBe("failed");
	});
});

describe("chess texts", () => {
	it("has the same keys in English and Russian", () => {
		expect(Object.keys(chess.ru).sort()).toEqual(Object.keys(chess.en).sort());
		for (const language of ["en", "ru"] as const) {
			for (const value of Object.values(chess[language])) expect(value.trim().length).toBeGreaterThan(0);
		}
	});

	it("covers every time class, tier and end reason the screens ask for", () => {
		const keys = Object.keys(chess.en);
		for (const timeClass of TIME_CLASSES) expect(keys).toContain(`chess.${timeClass}`);
		for (const tier of new Set(CHESS_BOTS.map((bot) => bot.tier))) expect(keys).toContain(`chess.tier.${tier}`);
		for (const reason of ["checkmate", "stalemate", "timeout", "resignation", "agreement", "repetition", "insufficient", "fiftyMove", "abort", "abandoned"]) {
			expect(keys).toContain(`chess.reason.${reason}`);
		}
	});
});
