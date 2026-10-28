import { supabase } from "@/constants/Supabase";
import { Color } from "./ChessClock";
import { ChessResult } from "./ChessPgn";
import { TIME_CLASSES, TimeClass } from "./TimeControls";

// The client side of the chess_ratings migration: read my ratings, report how an online game ended. Ratings are
// computed and stored only on the server; a guest (not signed in) simply has none.

export type ChessRatings = Record<TimeClass, { rating: number; games: number } | null>;

export const NO_RATINGS: ChessRatings = { bullet: null, blitz: null, rapid: null };

export function parseRatings(rows: unknown): ChessRatings {
	const result: ChessRatings = { bullet: null, blitz: null, rapid: null };
	if (!Array.isArray(rows)) return result;
	for (const row of rows) {
		if (!row || typeof row !== "object") continue;
		const entry = row as Record<string, unknown>;
		const timeClass = entry.time_class as TimeClass;
		if (!TIME_CLASSES.includes(timeClass)) continue;
		if (typeof entry.rating !== "number" || typeof entry.games_played !== "number") continue;
		result[timeClass] = { rating: entry.rating, games: entry.games_played };
	}
	return result;
}

export async function fetchMyChessRatings(): Promise<ChessRatings> {
	try {
		const { data: { session } } = await supabase.auth.getSession();
		if (!session?.user) return { ...NO_RATINGS };
		const { data, error } = await supabase.rpc("get_my_chess_ratings");
		if (error) return { ...NO_RATINGS };
		return parseRatings(data);
	} catch {
		return { ...NO_RATINGS };
	}
}

export type ReportStatus = "applied" | "pending" | "disputed" | "too_short" | "opponent_unknown" | "unauthenticated" | "failed";

export interface ReportOutcome {
	status: ReportStatus;
	before?: number;
	after?: number;
}

export function parseReport(data: unknown): ReportOutcome {
	if (!data || typeof data !== "object") return { status: "failed" };
	const row = data as Record<string, unknown>;
	const known: ReportStatus[] = ["applied", "pending", "disputed", "too_short", "opponent_unknown", "unauthenticated"];
	const status = known.includes(row.status as ReportStatus) ? (row.status as ReportStatus) : "failed";
	return {
		status,
		before: typeof row.before === "number" ? row.before : undefined,
		after: typeof row.after === "number" ? row.after : undefined,
	};
}

/** Reports a finished friend game. Null-safe: a failure only means the result is not rated. */
export async function reportChessMatch(input: {
	roomCode: string;
	timeClass: TimeClass;
	myColor: Color;
	opponentName: string;
	result: ChessResult;
	plies: number;
}): Promise<ReportOutcome> {
	try {
		if (input.result === "*") return { status: "failed" };
		const { data, error } = await supabase.rpc("report_chess_match", {
			p_room_code: input.roomCode,
			p_time_class: input.timeClass,
			p_my_color: input.myColor,
			p_opponent_name: input.opponentName,
			p_result: input.result,
			p_plies: input.plies,
		});
		if (error) return { status: "failed" };
		return parseReport(data);
	} catch {
		return { status: "failed" };
	}
}
