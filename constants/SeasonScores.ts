import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase, type GlobalHighScore } from "./Supabase";

// Monthly leaderboard seasons for Classic and Chaos. A season is a UTC calendar month and is
// keyed 'YYYY-MM', matching public.current_season_key() on the server.

export type SeasonBoard = "classic" | "chaos";

const PENDING_SEASON_SCORES_KEY = "PENDING_SEASON_SCORES";
let queueLock: Promise<unknown> = Promise.resolve();

function serialize<T>(operation: () => Promise<T>): Promise<T> {
	const result = queueLock.then(operation, operation);
	queueLock = result.catch(() => undefined);
	return result;
}

export interface PendingSeasonScore {
	ownerUserId: string;
	board: SeasonBoard;
	score: number;
	/** When the run finished (ms); decides which season it belongs to. */
	achievedAt: number;
}

export type SeasonScoreSubmitter = (board: SeasonBoard, score: number, achievedAt: number) => Promise<boolean>;

export function getSeasonKey(date: Date = new Date()): string {
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** First instant of the next season (UTC). */
export function getSeasonEndsAt(date: Date = new Date()): Date {
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

/**
 * A run of the previous month is still accepted for one day after the season ends: the server
 * closes the old season on the 2nd (00:05 UTC), so the last evening of a month is not lost.
 */
export const SEASON_GRACE_MS = 24 * 60 * 60 * 1000;

/** Whether a run achieved at `achievedAt` can still be submitted at `now`. */
export function isSeasonOpenForSubmission(achievedAt: number, now: Date = new Date()): boolean {
	const runSeason = getSeasonKey(new Date(achievedAt));
	if (runSeason === getSeasonKey(now)) return true;
	const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
	if (runSeason !== getSeasonKey(previous)) return false;
	return now.getTime() < getSeasonEndsAt(previous).getTime() + SEASON_GRACE_MS;
}

export function getSeasonBoard(gameMode: string): SeasonBoard | null {
	return gameMode === "classic" || gameMode === "chaos" ? gameMode : null;
}

const submitSeasonScoreToServer: SeasonScoreSubmitter = async (board, score, achievedAt) => {
	const { data, error } = await supabase.rpc("submit_season_score", {
		p_board: board,
		p_score: score,
		p_achieved_at: new Date(achievedAt).toISOString(),
	});
	if (error) throw error;
	return data === true;
};

async function readPending(): Promise<PendingSeasonScore[]> {
	try {
		const raw = await AsyncStorage.getItem(PENDING_SEASON_SCORES_KEY);
		const parsed = raw ? JSON.parse(raw) : [];
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((entry): entry is PendingSeasonScore => Boolean(
			entry &&
			typeof entry.ownerUserId === "string" &&
			(entry.board === "classic" || entry.board === "chaos") &&
			typeof entry.score === "number" &&
			typeof entry.achievedAt === "number"
		));
	} catch (error) {
		console.error("Error reading pending season scores:", error);
		return [];
	}
}

async function writePending(entries: PendingSeasonScore[]): Promise<void> {
	if (entries.length === 0) {
		await AsyncStorage.removeItem(PENDING_SEASON_SCORES_KEY);
		return;
	}
	await AsyncStorage.setItem(PENDING_SEASON_SCORES_KEY, JSON.stringify(entries));
}

export function getPendingSeasonScores(): Promise<PendingSeasonScore[]> {
	return readPending();
}

async function queueSeasonScore(entry: PendingSeasonScore): Promise<void> {
	await serialize(async () => {
		const pending = await readPending();
		const sameSeasonAs = (other: PendingSeasonScore) =>
			other.ownerUserId === entry.ownerUserId &&
			other.board === entry.board &&
			getSeasonKey(new Date(other.achievedAt)) === getSeasonKey(new Date(entry.achievedAt));
		const existing = pending.find(sameSeasonAs);
		if (!existing) {
			pending.push(entry);
		} else if (entry.score > existing.score) {
			existing.score = entry.score;
			existing.achievedAt = entry.achievedAt;
		}
		await writePending(pending);
	});
}

/** Records a finished run for the season board of its mode; queues it when offline. */
export async function submitSeasonScoreOrQueue(
	gameMode: string,
	score: number,
	ownerUserId: string,
	achievedAt: number = Date.now(),
	submit: SeasonScoreSubmitter = submitSeasonScoreToServer
): Promise<"synced" | "queued" | "skipped"> {
	const board = getSeasonBoard(gameMode);
	if (!board || !ownerUserId || !Number.isFinite(score) || score <= 0) return "skipped";

	try {
		if (await submit(board, score, achievedAt)) return "synced";
	} catch (error) {
		console.error("Error submitting season score:", error);
	}

	await queueSeasonScore({ ownerUserId, board, score, achievedAt });
	return "queued";
}

/** Convenience wrapper for game-over code: resolves the signed-in user itself. */
export async function recordSeasonScore(gameMode: string, score: number): Promise<void> {
	try {
		const { data: { session } } = await supabase.auth.getSession();
		if (!session?.user) return;
		await submitSeasonScoreOrQueue(gameMode, score, session.user.id);
	} catch (error) {
		console.error("Error recording season score:", error);
	}
}

/** Retries queued runs of the signed-in user; runs of seasons that can no longer be submitted are dropped. */
export async function flushPendingSeasonScores(
	currentUserId: string | undefined,
	submit: SeasonScoreSubmitter = submitSeasonScoreToServer,
	now: Date = new Date()
): Promise<{ synced: number; remaining: number }> {
	return serialize(async () => {
		const pending = await readPending();
		if (pending.length === 0) return { synced: 0, remaining: 0 };

		const remaining: PendingSeasonScore[] = [];
		let synced = 0;

		for (const entry of pending) {
			if (!isSeasonOpenForSubmission(entry.achievedAt, now)) continue;
			if (!currentUserId || entry.ownerUserId !== currentUserId) {
				remaining.push(entry);
				continue;
			}
			try {
				if (await submit(entry.board, entry.score, entry.achievedAt)) {
					synced += 1;
				} else {
					remaining.push(entry);
				}
			} catch (error) {
				console.error("Error flushing pending season score:", error);
				remaining.push(entry);
			}
		}

		await writePending(remaining);
		return { synced, remaining: remaining.length };
	});
}

export async function flushPendingSeasonScoresForSession(): Promise<void> {
	const { data: { session } } = await supabase.auth.getSession();
	await flushPendingSeasonScores(session?.user.id);
}

/** Top players of the running season for one board, best first. */
/** The current season's ranking among the player and their accepted friends. Empty for guests. */
export async function getFriendsSeasonLeaderboard(board: SeasonBoard): Promise<GlobalHighScore[]> {
	try {
		const { data, error } = await supabase.rpc("get_friends_season_leaderboard", { p_board: board });
		if (error || !Array.isArray(data)) return [];

		return data.map((row: { player_name?: string; avatar_url?: string | null; score?: number }) => ({
			player_name: row.player_name || "Player",
			score: row.score || 0,
			game_mode: board,
			avatar_url: row.avatar_url ?? undefined,
		}));
	} catch {
		return [];
	}
}

export async function getSeasonLeaderboard(board: SeasonBoard, limit: number = 100): Promise<GlobalHighScore[]> {
	try {
		const { data, error } = await supabase
			.from("season_leaderboard")
			.select("player_name, avatar_url, score, updated_at")
			.eq("season_key", getSeasonKey())
			.eq("board", board)
			.order("score", { ascending: false })
			.order("updated_at", { ascending: true })
			.limit(limit);

		if (error || !data) {
			if (error) console.error("Error fetching season leaderboard:", error);
			return [];
		}

		return data.map((row) => ({
			player_name: row.player_name || "Player",
			score: row.score || 0,
			game_mode: board,
			created_at: row.updated_at ?? undefined,
			avatar_url: row.avatar_url ?? undefined,
		}));
	} catch (error) {
		console.error("Error fetching season leaderboard:", error);
		return [];
	}
}
