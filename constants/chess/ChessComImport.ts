import { supabase } from "@/constants/Supabase";
import { TimeClass } from "./TimeControls";

// Moving the chess.com rating over (once per account). The player proves the chess.com account is theirs by putting
// a code into its "Location" field; the server (edge function chess-com-import) checks it and sets the ratings.

export type ImportedRatings = Partial<Record<TimeClass, number>>;

export type ChessComImportStatus =
	| { status: "pending"; code: string }
	| { status: "imported"; username: string; ratings: ImportedRatings }
	| { status: "signed_out" }
	| { status: "failed" };

export type ChessComImportResult =
	| { status: "imported"; username: string; ratings: ImportedRatings }
	| { status: "code_missing" | "not_found" | "no_ratings" | "already_imported" | "username_taken" | "invalid" | "no_code" | "signed_out" | "failed" };

const RESULT_STATUSES = ["imported", "code_missing", "not_found", "no_ratings", "already_imported", "username_taken", "invalid", "no_code", "signed_out", "failed"];

export function parseImportStatus(data: unknown): ChessComImportStatus {
	const row = data as { status?: string; code?: unknown; username?: unknown; ratings?: unknown } | null;
	if (row?.status === "pending" && typeof row.code === "string") return { status: "pending", code: row.code };
	if (row?.status === "imported") return { status: "imported", username: String(row.username ?? ""), ratings: (row.ratings ?? {}) as ImportedRatings };
	if (row?.status === "signed_out") return { status: "signed_out" };
	return { status: "failed" };
}

export function parseImportResult(data: unknown): ChessComImportResult {
	const row = data as { status?: string; username?: unknown; ratings?: unknown } | null;
	if (row?.status === "imported") return { status: "imported", username: String(row.username ?? ""), ratings: (row.ratings ?? {}) as ImportedRatings };
	return { status: (RESULT_STATUSES.includes(row?.status ?? "") ? row!.status : "failed") as Exclude<ChessComImportResult["status"], "imported"> };
}

export async function fetchChessComImportStatus(): Promise<ChessComImportStatus> {
	try {
		const { data, error } = await supabase.rpc("chess_com_import_status");
		return error ? { status: "failed" } : parseImportStatus(data);
	} catch {
		return { status: "failed" };
	}
}

export async function importChessComRating(username: string): Promise<ChessComImportResult> {
	try {
		const { data, error } = await supabase.functions.invoke("chess-com-import", { body: { username } });
		if (error) {
			// a 401 from the function arrives as an error with the body in its context
			const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
			return parseImportResult(body);
		}
		return parseImportResult(data);
	} catch {
		return { status: "failed" };
	}
}
