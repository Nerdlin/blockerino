import AsyncStorage from "@react-native-async-storage/async-storage";
import { reportVersusResult, submitGlobalHighScore, supabase } from "./Supabase";
import type { VersusReportOutcome, VersusResult } from "./Supabase";

const PENDING_GLOBAL_HIGH_SCORES_KEY = "PENDING_GLOBAL_HIGH_SCORES";
const PENDING_VERSUS_REPORTS_KEY = "PENDING_VERSUS_REPORTS";
const VERSUS_REPORT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
let highScoreQueueLock: Promise<unknown> = Promise.resolve();
function serializeHighScoreQueue<T>(operation: () => Promise<T>): Promise<T> {
	const result = highScoreQueueLock.then(operation, operation);
	highScoreQueueLock = result.catch(() => undefined);
	return result;
}

export type HighScoreSubmitter = (
	playerName: string,
	score: number,
	gameMode: string
) => Promise<boolean>;

export type VersusReportSubmitter = (
	roomId: string,
	result: VersusResult
) => Promise<VersusReportOutcome | null>;

export interface PendingGlobalHighScore {
	ownerUserId?: string;
	id: string;
	playerName: string;
	score: number;
	gameMode: string;
	createdAt: number;
	updatedAt: number;
}

export interface PendingVersusReport {
	id: string;
	roomId: string;
	result: VersusResult;
	createdAt: number;
}

export interface FlushPendingHighScoresResult {
	synced: number;
	remaining: number;
}

function normalizeQueueName(playerName: string): string {
	return playerName.trim();
}

function createPendingId(playerName: string, gameMode: string): string {
	return `${gameMode}:${playerName.trim().toLowerCase()}`;
}

async function savePendingGlobalHighScores(entries: PendingGlobalHighScore[]): Promise<void> {
	if (entries.length === 0) {
		await AsyncStorage.removeItem(PENDING_GLOBAL_HIGH_SCORES_KEY);
		return;
	}

	await AsyncStorage.setItem(PENDING_GLOBAL_HIGH_SCORES_KEY, JSON.stringify(entries));
}

export async function getPendingGlobalHighScores(): Promise<PendingGlobalHighScore[]> {
	try {
		const raw = await AsyncStorage.getItem(PENDING_GLOBAL_HIGH_SCORES_KEY);
		if (!raw) return [];

		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];

		return parsed.filter((entry): entry is PendingGlobalHighScore => {
			return Boolean(
				entry &&
				typeof entry.id === "string" &&
				typeof entry.playerName === "string" &&
				typeof entry.score === "number" &&
				typeof entry.gameMode === "string" &&
				typeof entry.createdAt === "number" &&
				typeof entry.updatedAt === "number"
			);
		});
	} catch (error) {
		console.error("Error reading pending global scores:", error);
		return [];
	}
}

export async function queueGlobalHighScore(
	playerName: string,
	score: number,
	gameMode: string,
	ownerUserId?: string
): Promise<PendingGlobalHighScore | null> {
	return serializeHighScoreQueue(async () => {
	const normalizedName = normalizeQueueName(playerName);
	if (!normalizedName || score <= 0) return null;

	const pending = await getPendingGlobalHighScores();
	const id = ownerUserId ? `${ownerUserId}:${createPendingId(normalizedName, gameMode)}` : createPendingId(normalizedName, gameMode);
	const now = Date.now();
	const existingIndex = pending.findIndex((entry) => entry.id === id);

	if (existingIndex >= 0) {
		const existing = pending[existingIndex];
		const nextEntry = {
			...existing,
			playerName: normalizedName,
			score: Math.max(existing.score, score),
			updatedAt: now,
		};
		pending[existingIndex] = nextEntry;
		await savePendingGlobalHighScores(pending);
		return nextEntry;
	}

	const entry: PendingGlobalHighScore = {
		ownerUserId,
		id,
		playerName: normalizedName,
		score,
		gameMode,
		createdAt: now,
		updatedAt: now,
	};

	pending.push(entry);
	await savePendingGlobalHighScores(pending);
	return entry;
	});
}

export async function submitGlobalHighScoreOrQueue(
	playerName: string,
	score: number,
	gameMode: string,
	submitScore: HighScoreSubmitter = submitGlobalHighScore
): Promise<"synced" | "queued" | "skipped"> {
	const normalizedName = normalizeQueueName(playerName);
	if (!normalizedName || score <= 0) return "skipped";
	const ownerUserId = submitScore === submitGlobalHighScore ? (await supabase.auth.getSession()).data.session?.user.id : undefined;

	try {
		const synced = await submitScore(normalizedName, score, gameMode);
		if (synced) return "synced";
	} catch (error) {
		console.error("Error submitting global score:", error);
	}

	await queueGlobalHighScore(normalizedName, score, gameMode, ownerUserId);
	return "queued";
}

export async function flushPendingGlobalHighScores(
	submitScore: HighScoreSubmitter = submitGlobalHighScore
): Promise<FlushPendingHighScoresResult> {
	return serializeHighScoreQueue(async () => {
	const pending = await getPendingGlobalHighScores();
	if (pending.length === 0) {
		return { synced: 0, remaining: 0 };
	}

	const remaining: PendingGlobalHighScore[] = [];
	let synced = 0;
	const enforceOwner = submitScore === submitGlobalHighScore;
	const currentUserId = enforceOwner ? (await supabase.auth.getSession()).data.session?.user.id : undefined;
	const currentName = enforceOwner ? (await AsyncStorage.getItem('PLAYER_NAME'))?.trim().toLowerCase() : undefined;

	for (const entry of pending) {
		if (enforceOwner && (!currentUserId || (entry.ownerUserId ? entry.ownerUserId !== currentUserId : entry.playerName.toLowerCase() !== currentName))) {
			remaining.push(entry);
			continue;
		}
		try {
			const success = await submitScore(entry.playerName, entry.score, entry.gameMode);
			if (success) {
				synced += 1;
			} else {
				remaining.push(entry);
			}
		} catch (error) {
			console.error("Error flushing pending global score:", error);
			remaining.push(entry);
		}
	}

	await savePendingGlobalHighScores(remaining);
	return { synced, remaining: remaining.length };
	});
}

async function savePendingVersusReports(entries: PendingVersusReport[]): Promise<void> {
	if (entries.length === 0) {
		await AsyncStorage.removeItem(PENDING_VERSUS_REPORTS_KEY);
		return;
	}

	await AsyncStorage.setItem(PENDING_VERSUS_REPORTS_KEY, JSON.stringify(entries));
}

function isVersusResult(value: unknown): value is VersusResult {
	return value === "win" || value === "loss" || value === "draw";
}

export async function getPendingVersusReports(): Promise<PendingVersusReport[]> {
	try {
		const raw = await AsyncStorage.getItem(PENDING_VERSUS_REPORTS_KEY);
		if (!raw) return [];

		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];

		return parsed.filter((entry): entry is PendingVersusReport => {
			return Boolean(
				entry &&
				typeof entry.id === "string" &&
				typeof entry.roomId === "string" &&
				isVersusResult(entry.result) &&
				typeof entry.createdAt === "number"
			);
		});
	} catch (error) {
		console.error("Error reading pending versus reports:", error);
		return [];
	}
}

/** One report per room: the first result a player reports for a match is the one that counts. */
export async function queueVersusReport(roomId: string, result: VersusResult): Promise<PendingVersusReport | null> {
	if (!roomId || !isVersusResult(result)) return null;

	const pending = await getPendingVersusReports();
	const existing = pending.find((entry) => entry.id === roomId);
	if (existing) return existing;

	const entry: PendingVersusReport = { id: roomId, roomId, result, createdAt: Date.now() };
	pending.push(entry);
	await savePendingVersusReports(pending);
	return entry;
}

export async function reportVersusResultOrQueue(
	roomId: string,
	result: VersusResult,
	submitReport: VersusReportSubmitter = reportVersusResult
): Promise<{ state: "synced" | "queued" | "skipped"; outcome: VersusReportOutcome | null }> {
	if (!roomId || !isVersusResult(result)) return { state: "skipped", outcome: null };

	try {
		const outcome = await submitReport(roomId, result);
		if (outcome) return { state: "synced", outcome };
	} catch (error) {
		console.error("Error reporting versus result:", error);
	}

	await queueVersusReport(roomId, result);
	return { state: "queued", outcome: null };
}

export async function flushPendingVersusReports(
	submitReport: VersusReportSubmitter = reportVersusResult
): Promise<FlushPendingHighScoresResult> {
	const pending = await getPendingVersusReports();
	if (pending.length === 0) {
		return { synced: 0, remaining: 0 };
	}

	const remaining: PendingVersusReport[] = [];
	let synced = 0;

	for (const entry of pending) {
		// The server forgets unfinished matches after a while, so an old report can no longer count.
		if (Date.now() - entry.createdAt > VERSUS_REPORT_MAX_AGE_MS) continue;
		try {
			const outcome = await submitReport(entry.roomId, entry.result);
			if (outcome) {
				synced += 1;
			} else {
				remaining.push(entry);
			}
		} catch (error) {
			console.error("Error flushing pending versus report:", error);
			remaining.push(entry);
		}
	}

	await savePendingVersusReports(remaining);
	return { synced, remaining: remaining.length };
}
