import AsyncStorage from "@react-native-async-storage/async-storage";

// Wins, losses and draws per game, kept on the device for the profile ("My record"). Games against a bot are
// counted separately so a streak of easy wins does not pass for skill. The counters are pushed to the account by
// PlayerProfile.ts (so another phone and the public profile see them); this file only keeps them on the device.

export type GameOutcome = "win" | "loss" | "draw";

export interface GameRecord {
	wins: number;
	losses: number;
	draws: number;
	botWins: number;
	botLosses: number;
	botDraws: number;
}

export type GameRecords = Record<string, GameRecord>;

/** Games the profile lists, in this order; "versus" is the Block duel. */
export const RECORDED_GAME_IDS = ["versus", "chess", "battleship", "durak", "tictactoe", "sudoku", "mahjong"] as const;

const KEY = "GAME_RECORDS_V1";
const FIELDS: (keyof GameRecord)[] = ["wins", "losses", "draws", "botWins", "botLosses", "botDraws"];

export function emptyGameRecord(): GameRecord {
	return { wins: 0, losses: 0, draws: 0, botWins: 0, botLosses: 0, botDraws: 0 };
}

export function parseGameRecords(raw: string | null): GameRecords {
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return {};
		const result: GameRecords = {};
		for (const [gameId, value] of Object.entries(parsed as Record<string, unknown>)) {
			const record = emptyGameRecord();
			for (const field of FIELDS) {
				const amount = (value as Record<string, unknown> | null)?.[field];
				if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) record[field] = Math.floor(amount);
			}
			result[gameId] = record;
		}
		return result;
	} catch {
		return {};
	}
}

/** Pure: the record after one more result. */
export function addOutcome(record: GameRecord | undefined, outcome: GameOutcome, vsBot: boolean): GameRecord {
	const next = { ...(record ?? emptyGameRecord()) };
	const field: keyof GameRecord = outcome === "win" ? (vsBot ? "botWins" : "wins") : outcome === "loss" ? (vsBot ? "botLosses" : "losses") : vsBot ? "botDraws" : "draws";
	next[field] += 1;
	return next;
}

/** Pure: counters only grow, so two sets of records merge by taking the larger value of every counter. */
export function mergeGameRecords(a: GameRecords, b: GameRecords): GameRecords {
	const result: GameRecords = {};
	for (const gameId of new Set([...Object.keys(a), ...Object.keys(b)])) {
		const left = a[gameId] ?? emptyGameRecord();
		const right = b[gameId] ?? emptyGameRecord();
		const merged = emptyGameRecord();
		for (const field of FIELDS) merged[field] = Math.max(left[field], right[field]);
		result[gameId] = merged;
	}
	return result;
}

export function gamesPlayed(record: GameRecord): number {
	return FIELDS.reduce((sum, field) => sum + record[field], 0);
}

let queue: Promise<void> = Promise.resolve();

const changeListeners = new Set<() => void>();
/** Called after a result was saved; the account sync uses it to push the new counters. */
export function subscribeToRecordChanges(listener: () => void): () => void {
	changeListeners.add(listener);
	return () => {
		changeListeners.delete(listener);
	};
}
function notifyRecordChanged() {
	changeListeners.forEach((listener) => {
		try {
			listener();
		} catch {
			// a broken listener must not lose the result
		}
	});
}

const listeners = new Set<(gameId: string, outcome: GameOutcome, vsBot: boolean) => void>();
/** Called at once when a result is recorded; the More Games screen plays a sound for it. */
export function subscribeToOutcomes(listener: (gameId: string, outcome: GameOutcome, vsBot: boolean) => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function recordGameOutcome(gameId: string, outcome: GameOutcome, options: { vsBot?: boolean } = {}): void {
	listeners.forEach((listener) => {
		try {
			listener(gameId, outcome, Boolean(options.vsBot));
		} catch {
			// a broken listener must not lose the result
		}
	});
	queue = queue.catch(() => undefined).then(async () => {
		try {
			const records = parseGameRecords(await AsyncStorage.getItem(KEY));
			records[gameId] = addOutcome(records[gameId], outcome, Boolean(options.vsBot));
			await AsyncStorage.setItem(KEY, JSON.stringify(records));
			notifyRecordChanged();
		} catch {
			// the record is a nicety; never fail a game over it
		}
	});
}

/** Adopts records from the account: the larger counter of device and server wins, so nothing is ever lowered. */
export async function adoptGameRecords(incoming: GameRecords): Promise<GameRecords> {
	let merged: GameRecords = incoming;
	queue = queue.catch(() => undefined).then(async () => {
		try {
			merged = mergeGameRecords(parseGameRecords(await AsyncStorage.getItem(KEY)), incoming);
			await AsyncStorage.setItem(KEY, JSON.stringify(merged));
		} catch {
			// the next sync tries again
		}
	});
	await queue;
	return merged;
}

export async function getGameRecords(): Promise<GameRecords> {
	await queue.catch(() => undefined);
	try {
		return parseGameRecords(await AsyncStorage.getItem(KEY));
	} catch {
		return {};
	}
}
