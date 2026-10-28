import AsyncStorage from "@react-native-async-storage/async-storage";
import { CHESS_BOTS } from "./BotRoster";

// What the device remembers about chess: which bots were beaten (they open the next one), the last results against
// Echo (the adaptive bot follows the player's form) and the time control picked last time.

const KEY = "CHESS_PROGRESS_V1";

export type FormResult = "W" | "L" | "D";

export interface ChessProgress {
	beatenBots: string[];
	/** Newest last, at most ten. */
	form: FormResult[];
	lastTimeControl: string | null;
}

const EMPTY: ChessProgress = { beatenBots: [], form: [], lastTimeControl: null };

export function parseProgress(raw: unknown): ChessProgress {
	if (!raw || typeof raw !== "object") return { ...EMPTY };
	const value = raw as Record<string, unknown>;
	const known = new Set(CHESS_BOTS.map((bot) => bot.id));
	const beaten = Array.isArray(value.beatenBots) ? value.beatenBots.filter((id): id is string => typeof id === "string" && known.has(id)) : [];
	const form = Array.isArray(value.form) ? value.form.filter((item): item is FormResult => item === "W" || item === "L" || item === "D").slice(-10) : [];
	return {
		beatenBots: Array.from(new Set(beaten)),
		form,
		lastTimeControl: typeof value.lastTimeControl === "string" ? value.lastTimeControl : null,
	};
}

export async function loadChessProgress(): Promise<ChessProgress> {
	try {
		const raw = await AsyncStorage.getItem(KEY);
		return parseProgress(raw ? JSON.parse(raw) : null);
	} catch {
		return { ...EMPTY };
	}
}

async function save(progress: ChessProgress): Promise<void> {
	try {
		await AsyncStorage.setItem(KEY, JSON.stringify(progress));
	} catch {
		// losing a bit of progress is better than failing a game over
	}
}

/** Records the end of a bot game. A win over a fixed bot is remembered (it opens the next one); every game feeds Echo's form. */
export async function recordBotGame(botId: string, result: FormResult): Promise<ChessProgress> {
	const progress = await loadChessProgress();
	const beaten = result === "W" && botId !== "echo" && !progress.beatenBots.includes(botId) ? [...progress.beatenBots, botId] : progress.beatenBots;
	const next: ChessProgress = { ...progress, beatenBots: beaten, form: [...progress.form, result].slice(-10) };
	await save(next);
	return next;
}

export async function rememberTimeControl(id: string): Promise<void> {
	const progress = await loadChessProgress();
	await save({ ...progress, lastTimeControl: id });
}
