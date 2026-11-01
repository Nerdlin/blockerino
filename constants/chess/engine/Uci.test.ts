import { UciEngine, parseInfoLine, whiteScore } from "./Uci";

describe("UCI client", () => {
	it("reads score, depth and pv from info lines", () => {
		expect(parseInfoLine("info depth 12 seldepth 18 multipv 1 score cp 34 nodes 100 pv e2e4 e7e5 g1f3")).toEqual({ cp: 34, depth: 12, pv: ["e2e4", "e7e5", "g1f3"] });
		expect(parseInfoLine("info depth 5 score mate -2 pv h7h8")).toEqual({ mate: -2, depth: 5, pv: ["h7h8"] });
		expect(parseInfoLine("info depth 11 score cp 83 pv d2d4 g8f6 e7e8q bmc 0.335247")?.pv).toEqual(["d2d4", "g8f6", "e7e8q"]);
		expect(parseInfoLine("info string NNUE evaluation")).toBeNull();
	});

	it("waits for the engine, runs jobs one at a time and returns the last score with the best move", async () => {
		const sent: string[] = [];
		const engine = new UciEngine({ send: (command) => sent.push(command) });
		engine.start();
		const first = engine.search("8/8/8/8/8/8/8/K6k w - - 0 1", { depth: 4, skill: 5 });
		const second = engine.search("8/8/8/8/8/8/8/K6k b - - 0 1", { movetimeMs: 300 });
		expect(sent).toEqual(["uci", "setoption name Contempt value 0", "isready"]);

		engine.onLine("uciok");
		expect(sent.slice(3)).toEqual(["setoption name Skill Level value 5", "position fen 8/8/8/8/8/8/8/K6k w - - 0 1", "go depth 4"]);
		engine.onLine("info depth 4 score cp 12 pv a1b1");
		engine.onLine("bestmove a1b1 ponder h1g1");
		await expect(first).resolves.toEqual({ cp: 12, depth: 4, pv: ["a1b1"], bestMove: "a1b1" });

		expect(sent.slice(6)).toEqual(["setoption name Skill Level value 20", "position fen 8/8/8/8/8/8/8/K6k b - - 0 1", "go movetime 300"]);
		engine.onLine("bestmove (none)");
		await expect(second).resolves.toMatchObject({ bestMove: null });
	});

	it("keeps the last exact score over a later bound", async () => {
		const engine = new UciEngine({ send: () => undefined });
		engine.start();
		engine.onLine("readyok");
		const result = engine.search("8/8/8/8/8/8/8/K6k w - - 0 1", { depth: 9 });
		engine.onLine("info depth 8 score cp 40 upperbound pv a1b1");
		engine.onLine("info depth 8 score cp 25 pv a1b2");
		engine.onLine("info depth 9 score cp 750 lowerbound pv a1a2");
		engine.onLine("bestmove a1b2");
		await expect(result).resolves.toMatchObject({ cp: 25, depth: 8, bestMove: "a1b2" });
	});

	it("turns scores into white's view in pawns", () => {
		expect(whiteScore({ cp: 150 }, "w")).toBe(1.5);
		expect(whiteScore({ cp: 150 }, "b")).toBe(-1.5);
		expect(whiteScore({ mate: 3 }, "b")).toBe(-10);
	});
});
