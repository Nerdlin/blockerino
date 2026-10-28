import { Chess } from "chess.js";
import { livePieces, trackPieces } from "./PieceTracker";

function squaresOf(pieces: ReturnType<typeof trackPieces>) {
	return livePieces(pieces).map((piece) => `${piece.color}${piece.type}@${piece.square}`).sort();
}
function boardSquares(chess: Chess) {
	return chess.board().flat().filter((piece) => piece !== null).map((piece) => `${piece!.color}${piece!.type}@${piece!.square}`).sort();
}
function playAll(sans: string[]) {
	const chess = new Chess();
	for (const san of sans) chess.move(san);
	return chess;
}

describe("piece tracker", () => {
	it("starts with 32 pieces and unique ids", () => {
		const pieces = trackPieces([]);
		expect(pieces).toHaveLength(32);
		expect(new Set(pieces.map((piece) => piece.id)).size).toBe(32);
		expect(pieces.find((piece) => piece.square === "e2")?.id).toBe("wp5");
	});

	it("keeps the identity of a moving piece and matches the board", () => {
		const sans = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"];
		const pieces = trackPieces(sans);
		expect(pieces.find((piece) => piece.id === "wp5")?.square).toBe("e4");
		expect(pieces.find((piece) => piece.id === "wn2")?.square).toBe("f3");
		expect(squaresOf(pieces)).toEqual(boardSquares(playAll(sans)));
	});

	it("removes a captured piece and moves the capturer there", () => {
		const sans = ["e4", "d5", "exd5"];
		const pieces = trackPieces(sans);
		expect(pieces.find((piece) => piece.id === "bp4")?.square).toBeNull();
		expect(pieces.find((piece) => piece.id === "wp5")?.square).toBe("d5");
		expect(squaresOf(pieces)).toEqual(boardSquares(playAll(sans)));
	});

	it("takes the right pawn on en passant", () => {
		const sans = ["e4", "a6", "e5", "d5", "exd6"];
		const pieces = trackPieces(sans);
		expect(pieces.find((piece) => piece.id === "bp4")?.square).toBeNull();
		expect(pieces.find((piece) => piece.id === "wp5")?.square).toBe("d6");
		expect(squaresOf(pieces)).toEqual(boardSquares(playAll(sans)));
	});

	it("moves the rook when castling on both sides", () => {
		const kingside = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O"];
		let pieces = trackPieces(kingside);
		expect(pieces.find((piece) => piece.id === "wr2")?.square).toBe("f1");
		expect(pieces.find((piece) => piece.id === "wk1")?.square).toBe("g1");
		expect(squaresOf(pieces)).toEqual(boardSquares(playAll(kingside)));

		const queenside = ["d4", "d5", "Nc3", "Nc6", "Bf4", "Bf5", "Qd2", "Qd7", "O-O-O"];
		pieces = trackPieces(queenside);
		expect(pieces.find((piece) => piece.id === "wr1")?.square).toBe("d1");
		expect(pieces.find((piece) => piece.id === "wk1")?.square).toBe("c1");
		expect(squaresOf(pieces)).toEqual(boardSquares(playAll(queenside)));
	});

	it("turns a promoted pawn into the new piece without changing its id", () => {
		const sans = ["a4", "b5", "axb5", "a6", "bxa6", "Nc6", "a7", "Nb8", "axb8=Q"];
		const pieces = trackPieces(sans);
		const promoted = pieces.find((piece) => piece.square === "b8");
		expect(promoted).toMatchObject({ type: "q", color: "w" });
		expect(promoted?.id).toBe("wp1");
		expect(squaresOf(pieces)).toEqual(boardSquares(playAll(sans)));
	});

	it("tracks a whole long game exactly like the board", () => {
		const chess = new Chess();
		const sans: string[] = [];
		let seed = 11;
		const rng = () => {
			seed = (seed * 16807) % 2147483647;
			return seed / 2147483647;
		};
		for (let i = 0; i < 120 && !chess.isGameOver(); i++) {
			const moves = chess.moves();
			const san = moves[Math.floor(rng() * moves.length)];
			chess.move(san);
			sans.push(san);
		}
		expect(squaresOf(trackPieces(sans))).toEqual(boardSquares(chess));
	});

	it("throws on an illegal move", () => {
		expect(() => trackPieces(["e5"])).toThrow();
	});
});
