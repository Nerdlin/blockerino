import AsyncStorage from "@react-native-async-storage/async-storage";
import { submitEloRating, submitGlobalHighScore } from "./Supabase";

const PENDING_GLOBAL_HIGH_SCORES_KEY = "PENDING_GLOBAL_HIGH_SCORES";
const PENDING_ELO_RATINGS_KEY = "PENDING_ELO_RATINGS";

export type HighScoreSubmitter = (
	playerName: string,
	score: number,
	gameMode: string
) => Promise<boolean>;

export type EloRatingSubmitter = (
	playerName: string,
	elo: number
) => Promise<boolean>;

export interface PendingGlobalHighScore {
	id: string;
	playerName: string;
	score: number;
	gameMode: string;
	createdAt: number;
	updatedAt: number;
}

export interface PendingEloRating {
	id: string;
	playerName: string;
	elo: number;
	createdAt: number;
	updatedAt: number;
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

function createPendingEloId(playerName: string): string {
	return playerName.trim().toLowerCase();
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
	gameMode: string
): Promise<PendingGlobalHighScore | null> {
	const normalizedName = normalizeQueueName(playerName);
	if (!normalizedName || score <= 0) return null;

	const pending = await getPendingGlobalHighScores();
	const id = createPendingId(normalizedName, gameMode);
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
}

export async function submitGlobalHighScoreOrQueue(
	playerName: string,
	score: number,
	gameMode: string,
	submitScore: HighScoreSubmitter = submitGlobalHighScore
): Promise<"synced" | "queued" | "skipped"> {
	const normalizedName = normalizeQueueName(playerName);
	if (!normalizedName || score <= 0) return "skipped";

	try {
		const synced = await submitScore(normalizedName, score, gameMode);
		if (synced) return "synced";
	} catch (error) {
		console.error("Error submitting global score:", error);
	}

	await queueGlobalHighScore(normalizedName, score, gameMode);
	return "queued";
}

export async function flushPendingGlobalHighScores(
	submitScore: HighScoreSubmitter = submitGlobalHighScore
): Promise<FlushPendingHighScoresResult> {
	const pending = await getPendingGlobalHighScores();
	if (pending.length === 0) {
		return { synced: 0, remaining: 0 };
	}

	const remaining: PendingGlobalHighScore[] = [];
	let synced = 0;

	for (const entry of pending) {
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
}

async function savePendingEloRatings(entries: PendingEloRating[]): Promise<void> {
	if (entries.length === 0) {
		await AsyncStorage.removeItem(PENDING_ELO_RATINGS_KEY);
		return;
	}

	await AsyncStorage.setItem(PENDING_ELO_RATINGS_KEY, JSON.stringify(entries));
}

export async function getPendingEloRatings(): Promise<PendingEloRating[]> {
	try {
		const raw = await AsyncStorage.getItem(PENDING_ELO_RATINGS_KEY);
		if (!raw) return [];

		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];

		return parsed.filter((entry): entry is PendingEloRating => {
			return Boolean(
				entry &&
				typeof entry.id === "string" &&
				typeof entry.playerName === "string" &&
				typeof entry.elo === "number" &&
				typeof entry.createdAt === "number" &&
				typeof entry.updatedAt === "number"
			);
		});
	} catch (error) {
		console.error("Error reading pending ELO ratings:", error);
		return [];
	}
}

export async function queueEloRating(
	playerName: string,
	elo: number
): Promise<PendingEloRating | null> {
	const normalizedName = normalizeQueueName(playerName);
	if (!normalizedName || !Number.isFinite(elo) || elo < 0) return null;

	const pending = await getPendingEloRatings();
	const id = createPendingEloId(normalizedName);
	const now = Date.now();
	const existingIndex = pending.findIndex((entry) => entry.id === id);

	if (existingIndex >= 0) {
		const nextEntry = {
			...pending[existingIndex],
			playerName: normalizedName,
			elo,
			updatedAt: now,
		};
		pending[existingIndex] = nextEntry;
		await savePendingEloRatings(pending);
		return nextEntry;
	}

	const entry: PendingEloRating = {
		id,
		playerName: normalizedName,
		elo,
		createdAt: now,
		updatedAt: now,
	};

	pending.push(entry);
	await savePendingEloRatings(pending);
	return entry;
}

export async function submitEloRatingOrQueue(
	playerName: string,
	elo: number,
	submitRating: EloRatingSubmitter = submitEloRating
): Promise<"synced" | "queued" | "skipped"> {
	const normalizedName = normalizeQueueName(playerName);
	if (!normalizedName || !Number.isFinite(elo) || elo < 0) return "skipped";

	try {
		const synced = await submitRating(normalizedName, elo);
		if (synced) return "synced";
	} catch (error) {
		console.error("Error submitting ELO rating:", error);
	}

	await queueEloRating(normalizedName, elo);
	return "queued";
}

export async function flushPendingEloRatings(
	submitRating: EloRatingSubmitter = submitEloRating
): Promise<FlushPendingHighScoresResult> {
	const pending = await getPendingEloRatings();
	if (pending.length === 0) {
		return { synced: 0, remaining: 0 };
	}

	const remaining: PendingEloRating[] = [];
	let synced = 0;

	for (const entry of pending) {
		try {
			const success = await submitRating(entry.playerName, entry.elo);
			if (success) {
				synced += 1;
			} else {
				remaining.push(entry);
			}
		} catch (error) {
			console.error("Error flushing pending ELO rating:", error);
			remaining.push(entry);
		}
	}

	await savePendingEloRatings(remaining);
	return { synced, remaining: remaining.length };
}
