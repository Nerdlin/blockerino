// Game review: every position of a finished game is evaluated by the engine, and each move is graded by how much it
// lost for the side that played it (in centipawns, from that side's point of view), as chess sites do.

export type MoveGrade = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

export interface PositionEval {
	/** White-relative centipawns; a mate counts as ±MATE_CP. */
	cp: number;
	/** The engine's best move in this position (UCI), if it found one. */
	bestMove: string | null;
}

export interface ReviewedMove {
	ply: number;
	san: string;
	mover: "w" | "b";
	loss: number;
	grade: MoveGrade;
	/** What the engine preferred instead (UCI); null when the played move was the engine's choice. */
	better: string | null;
}

export const MATE_CP = 1000;

export function gradeFor(loss: number, playedBest: boolean): MoveGrade {
	if (playedBest) return "best";
	if (loss >= 300) return "blunder";
	if (loss >= 150) return "mistake";
	if (loss >= 70) return "inaccuracy";
	return "good";
}

/** White-relative centipawns from an engine score given for the side to move. */
export function toWhiteCp(score: { cp?: number; mate?: number }, sideToMove: "w" | "b"): number {
	const raw = score.mate !== undefined ? (score.mate > 0 ? MATE_CP : -MATE_CP) : Math.max(-MATE_CP, Math.min(MATE_CP, score.cp ?? 0));
	return sideToMove === "w" ? raw : -raw;
}

/**
 * Grades every move. `evals[i]` is the position after i plies (evals[0] is the start), `uciMoves[i]` the move played
 * from position i. A move that matches the engine's best move is "best" whatever the numbers say.
 */
export function reviewGame(sans: readonly string[], uciMoves: readonly string[], evals: readonly PositionEval[]): ReviewedMove[] {
	const moves: ReviewedMove[] = [];
	for (let i = 0; i < sans.length && i + 1 < evals.length; i++) {
		const mover: "w" | "b" = i % 2 === 0 ? "w" : "b";
		const sign = mover === "w" ? 1 : -1;
		const loss = Math.max(0, (evals[i].cp - evals[i + 1].cp) * sign);
		const playedBest = evals[i].bestMove !== null && evals[i].bestMove === uciMoves[i];
		moves.push({ ply: i + 1, san: sans[i], mover, loss, grade: gradeFor(loss, playedBest), better: playedBest ? null : evals[i].bestMove });
	}
	return moves;
}

/** A 0-100 accuracy for one side: 100 when nothing was lost, falling off with the average loss per move. */
export function accuracy(moves: readonly ReviewedMove[], side: "w" | "b"): number {
	const own = moves.filter((move) => move.mover === side);
	if (own.length === 0) return 100;
	const score = own.reduce((sum, move) => sum + Math.exp(-Math.min(move.loss, MATE_CP) / 250), 0) / own.length;
	return Math.round(score * 100);
}

export function countGrades(moves: readonly ReviewedMove[], side: "w" | "b"): Record<MoveGrade, number> {
	const counts: Record<MoveGrade, number> = { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
	for (const move of moves) if (move.mover === side) counts[move.grade]++;
	return counts;
}
