jest.mock("@react-native-async-storage/async-storage", () => ({ getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() }));

import { closestBotElo, isChessComUsername, lookupChessCom, parseChessComStats } from "./ChessCom";

describe("chess.com link", () => {
	it("accepts chess.com style usernames only", () => {
		expect(isChessComUsername("Hikaru")).toBe(true);
		expect(isChessComUsername("some_player-2")).toBe(true);
		expect(isChessComUsername("ab")).toBe(false);
		expect(isChessComUsername("bad name")).toBe(false);
		expect(isChessComUsername("../stats")).toBe(false);
	});

	it("reads the last rating per time class and skips the ones never played", () => {
		const link = parseChessComStats("Someone", {
			chess_blitz: { last: { rating: 1340 } },
			chess_rapid: { last: { rating: 1502 } },
			tactics: { highest: { rating: 1800 } },
		}, 1);
		expect(link).toEqual({ username: "Someone", ratings: { blitz: 1340, rapid: 1502 }, puzzles: 1800, fetchedAt: 1 });
	});

	it("maps the API answers to statuses", async () => {
		const ok = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ chess_bullet: { last: { rating: 900 } } }) });
		const res = await lookupChessCom(" Someone ", ok as unknown as typeof fetch);
		expect(res.status).toBe("ok");
		expect(ok.mock.calls[0][0]).toBe("https://api.chess.com/pub/player/someone/stats");

		const missing = jest.fn().mockResolvedValue({ ok: false, status: 404 });
		expect((await lookupChessCom("nobody_here", missing as unknown as typeof fetch)).status).toBe("not_found");
		const down = jest.fn().mockRejectedValue(new Error("offline"));
		expect((await lookupChessCom("someone", down as unknown as typeof fetch)).status).toBe("failed");
		expect((await lookupChessCom("x", ok as unknown as typeof fetch)).status).toBe("invalid");
	});

	it("suggests the bot nearest to the imported rating", () => {
		expect(closestBotElo(1340, [400, 800, 1200, 1500])).toBe(1200);
		expect(closestBotElo(undefined, [400])).toBeNull();
	});
});
