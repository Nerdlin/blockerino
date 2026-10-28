jest.mock("@/constants/Supabase", () => ({ supabase: { rpc: jest.fn(), auth: { getSession: jest.fn() } } }));

import { chess } from "../i18n/chess";
import { parseRatings, parseReport } from "./ChessRatingsApi";
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
