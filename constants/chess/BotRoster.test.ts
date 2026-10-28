import { Chess } from "chess.js";
import { chooseChessMoveByElo, engineParamsForElo } from "../bots/ChessBot";
import { adaptiveBotElo, botQuip, CHESS_BOTS, getBot, isBotUnlocked, nextBotToUnlock } from "./BotRoster";

const seeded = (seed: number) => () => {
	seed = (seed * 1664525 + 1013904223) % 4294967296;
	return seed / 4294967296;
};

describe("bot roster", () => {
	it("is ordered by Elo with unique ids and names", () => {
		const elos = CHESS_BOTS.map((bot) => bot.elo);
		expect([...elos].sort((a, b) => a - b)).toEqual(elos);
		expect(new Set(CHESS_BOTS.map((bot) => bot.id)).size).toBe(CHESS_BOTS.length);
		expect(new Set(CHESS_BOTS.map((bot) => bot.name)).size).toBe(CHESS_BOTS.length);
		expect(getBot("pip")?.elo).toBe(400);
	});

	it("opens one bot at a time as the previous one is beaten", () => {
		expect(isBotUnlocked("pip", [])).toBe(true);
		expect(isBotUnlocked("dot", [])).toBe(false);
		expect(isBotUnlocked("dot", ["pip"])).toBe(true);
		expect(isBotUnlocked("nibble", ["pip"])).toBe(false);
		expect(isBotUnlocked("nope", ["pip"])).toBe(false);
		expect(nextBotToUnlock([])?.bot.id).toBe("dot");
		expect(nextBotToUnlock(["pip", "dot"])?.bot.id).toBe("tilt");
		expect(nextBotToUnlock(["pip", "dot"])?.mustBeat.id).toBe("nibble");
		expect(nextBotToUnlock(CHESS_BOTS.map((bot) => bot.id))).toBeNull();
	});

	it("keeps the adaptive bot near the player and inside the engine's range", () => {
		expect(adaptiveBotElo(1180)).toBe(1180);
		expect(adaptiveBotElo(1180, ["W", "W", "W"])).toBe(1240);
		expect(adaptiveBotElo(1180, ["L", "L"])).toBe(1140);
		expect(adaptiveBotElo(200)).toBe(400);
		expect(adaptiveBotElo(2200, ["W"])).toBe(1500);
	});

	it("has a line for every moment in both languages", () => {
		for (const bot of CHESS_BOTS) {
			for (const kind of ["greeting", "playerMove", "capture", "check", "botWins", "botLoses", "draw"] as const) {
				for (const lang of ["en", "ru"] as const) expect(botQuip(bot, kind, lang, seeded(3)).length).toBeGreaterThan(3);
			}
		}
	});
});

describe("engine by Elo", () => {
	it("searches deeper and blunders less as the Elo rises", () => {
		let previous = engineParamsForElo(400);
		for (const elo of [500, 650, 800, 950, 1100, 1200, 1300, 1400, 1500]) {
			const params = engineParamsForElo(elo);
			expect(params.depth).toBeGreaterThanOrEqual(previous.depth);
			expect(params.randomMoveChance).toBeLessThanOrEqual(previous.randomMoveChance);
			previous = params;
		}
	});

	it("always plays a legal move and finds mate in one", () => {
		for (const elo of [400, 800, 1200, 1500]) {
			const chess = new Chess();
			const move = chooseChessMoveByElo(chess.fen(), elo, seeded(elo), { timeBudgetMs: 60 });
			expect(() => chess.move(move!)).not.toThrow();
		}
		const fen = "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 2 3";
		const chess = new Chess(fen);
		chess.move(chooseChessMoveByElo(fen, 1100, () => 0.99, { timeBudgetMs: 200 })!);
		expect(chess.isCheckmate()).toBe(true);
	});
});

// Self-play: a bot of a clearly higher Elo should score better than a lower one. Short games and a tiny time budget
// keep it quick; it checks the order of the ladder, not exact ratings.
function play(whiteElo: number, blackElo: number, seed: number): "w" | "b" | "draw" {
	const rng = seeded(seed);
	const chess = new Chess();
	for (let ply = 0; ply < 160 && !chess.isGameOver(); ply++) {
		const elo = chess.turn() === "w" ? whiteElo : blackElo;
		const move = chooseChessMoveByElo(chess.fen(), elo, rng, { timeBudgetMs: 25 });
		if (!move) break;
		chess.move(move);
	}
	if (chess.isCheckmate()) return chess.turn() === "w" ? "b" : "w";
	return "draw";
}

describe("ladder strength (self-play)", () => {
	const score = (strong: number, weak: number, games: number) => {
		let points = 0;
		for (let i = 0; i < games; i++) {
			const strongIsWhite = i % 2 === 0;
			const result = strongIsWhite ? play(strong, weak, 100 + i) : play(weak, strong, 100 + i);
			if (result === "draw") points += 0.5;
			else if ((result === "w") === strongIsWhite) points += 1;
		}
		return points / games;
	};

	it("a 1100 bot beats a 450 bot most of the time", () => {
		expect(score(1100, 450, 6)).toBeGreaterThanOrEqual(0.65);
	}, 120000);

	it("a 1500 bot does not lose to a 800 bot", () => {
		expect(score(1500, 800, 4)).toBeGreaterThanOrEqual(0.6);
	}, 180000);
});
