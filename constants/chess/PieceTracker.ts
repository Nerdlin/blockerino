import { Chess } from "chess.js";

// Follows every piece through a game so the board can slide the same piece from square to square (and fade a captured
// one) instead of redrawing the position. A plain FEN cannot do that: it has no idea which pawn is which.

export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
export type PieceColor = "w" | "b";

export interface TrackedPiece {
	/** Stable for the whole game, e.g. "wp5" (the fifth white pawn found on the starting board). */
	id: string;
	type: PieceType;
	color: PieceColor;
	/** Null once the piece was captured. */
	square: string | null;
}

function initialPieces(): TrackedPiece[] {
	const pieces: TrackedPiece[] = [];
	const counts: Record<string, number> = {};
	for (const row of new Chess().board()) {
		for (const piece of row) {
			if (!piece) continue;
			const prefix = `${piece.color}${piece.type}`;
			counts[prefix] = (counts[prefix] ?? 0) + 1;
			pieces.push({ id: `${prefix}${counts[prefix]}`, type: piece.type, color: piece.color, square: piece.square });
		}
	}
	return pieces;
}

/** The pieces after the given moves (SAN, from the starting position). Throws on an illegal move, like chess.js. */
export function trackPieces(sans: readonly string[]): TrackedPiece[] {
	const chess = new Chess();
	const pieces = initialPieces();
	const at = (square: string) => pieces.find((piece) => piece.square === square);
	for (const san of sans) {
		const move = chess.move(san);
		const mover = at(move.from);
		if (!mover) throw new Error(`no piece on ${move.from} for ${san}`);

		// captures are removed before the mover arrives (en passant takes the pawn beside, not the one on the target)
		const captured = move.flags.includes("e") ? at(`${move.to[0]}${move.from[1]}`) : move.captured ? at(move.to) : undefined;
		if (captured) captured.square = null;

		mover.square = move.to;
		if (move.promotion) mover.type = move.promotion as PieceType;

		// castling moves the rook as well
		if (move.flags.includes("k")) {
			const rook = at(`h${move.from[1]}`);
			if (rook) rook.square = `f${move.from[1]}`;
		} else if (move.flags.includes("q")) {
			const rook = at(`a${move.from[1]}`);
			if (rook) rook.square = `d${move.from[1]}`;
		}
	}
	return pieces;
}

/** Only the pieces still on the board. */
export function livePieces(pieces: readonly TrackedPiece[]): (TrackedPiece & { square: string })[] {
	return pieces.filter((piece): piece is TrackedPiece & { square: string } => piece.square !== null);
}
