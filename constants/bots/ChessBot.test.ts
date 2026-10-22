import { Chess } from "chess.js";
import { chooseChessMove } from "./ChessBot";

const seeded = (seed: number) => () => {
	seed = (seed * 1664525 + 1013904223) % 4294967296;
	return seed / 4294967296;
};

describe("chooseChessMove", () => {
	it("returns null when the game is over", () => {
		const mated = new Chess("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3");
		expect(mated.isCheckmate()).toBe(true);
		expect(chooseChessMove(mated.fen(), "hard")).toBeNull();
	});

	it("always plays a legal move at every level", () => {
		for (const difficulty of ["easy", "medium", "hard"] as const) {
			const chess = new Chess();
			const move = chooseChessMove(chess.fen(), difficulty, seeded(4));
			expect(move).not.toBeNull();
			expect(() => chess.move(move!)).not.toThrow();
		}
	});

	it("finds a mate in one on medium and hard", () => {
		// White to move: Qh5xf7# (scholar's mate pattern).
		const fen = "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 2 3";
		for (const difficulty of ["medium", "hard"] as const) {
			const chess = new Chess(fen);
			const move = chooseChessMove(fen, difficulty, seeded(9))!;
			chess.move(move);
			expect(chess.isCheckmate()).toBe(true);
		}
	});

	it("takes a hanging queen on medium and hard", () => {
		// White knight on e5 can take the undefended black queen on d7.
		const fen = "4k3/3q4/8/4N3/8/8/8/4K3 w - - 0 1";
		for (const difficulty of ["medium", "hard"] as const) {
			const move = chooseChessMove(fen, difficulty, seeded(2))!;
			expect(move.to).toBe("d7");
		}
	});

	it("does not leave its queen to be captured for nothing on hard", () => {
		// Black pawn on d5 attacks the white queen on e4: the queen has to move or capture.
		const fen = "4k3/8/8/3p4/4Q3/8/8/4K3 w - - 0 1";
		const move = chooseChessMove(fen, "hard", seeded(2))!;
		const chess = new Chess(fen);
		chess.move(move);
		const captured = (chess.moves({ verbose: true }) as any[]).some((reply) => reply.to === move.to && reply.captured === "q");
		expect(captured).toBe(false);
	});

	it("answers the first move quickly enough on hard", () => {
		const started = Date.now();
		chooseChessMove(new Chess().fen(), "hard", seeded(1));
		expect(Date.now() - started).toBeLessThan(6000);
	});

	it("beats a random mover on medium", () => {
		let botScore = 0;
		for (let game = 0; game < 3; game++) {
			const rng = seeded(game * 17 + 5);
			const chess = new Chess();
			const botIsWhite = game % 2 === 0;
			let plies = 0;
			while (!chess.isGameOver() && plies < 120) {
				const botTurn = (chess.turn() === "w") === botIsWhite;
				if (botTurn) chess.move(chooseChessMove(chess.fen(), "medium", rng)!);
				else {
					const moves = chess.moves({ verbose: true }) as any[];
					chess.move(moves[Math.floor(rng() * moves.length)]);
				}
				plies++;
			}
			if (chess.isCheckmate()) botScore += (chess.turn() === "w") === botIsWhite ? -1 : 1;
		}
		expect(botScore).toBeGreaterThanOrEqual(2);
	}, 120000);
});
