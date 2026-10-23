import AsyncStorage from "@react-native-async-storage/async-storage";

// Wins, losses and draws per game, kept on the device for the profile ("My record"). Games against a bot are
// counted separately so a streak of easy wins does not pass for skill. Nothing here goes to the server.

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

export function gamesPlayed(record: GameRecord): number {
	return FIELDS.reduce((sum, field) => sum + record[field], 0);
}

let queue: Promise<void> = Promise.resolve();

export function recordGameOutcome(gameId: string, outcome: GameOutcome, options: { vsBot?: boolean } = {}): void {
	queue = queue.catch(() => undefined).then(async () => {
		try {
			const records = parseGameRecords(await AsyncStorage.getItem(KEY));
			records[gameId] = addOutcome(records[gameId], outcome, Boolean(options.vsBot));
			await AsyncStorage.setItem(KEY, JSON.stringify(records));
		} catch {
			// the record is a nicety; never fail a game over it
		}
	});
}

export async function getGameRecords(): Promise<GameRecords> {
	await queue.catch(() => undefined);
	try {
		return parseGameRecords(await AsyncStorage.getItem(KEY));
	} catch {
		return {};
	}
}
