import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase, type GlobalHighScore } from "./Supabase";
import { getSeasonBoard, type SeasonBoard } from "./SeasonScores";

// The Discord server's table: the best score of each player in this season among the people who played in the same Discord
// server (see migration 20261123120000_discord_server_board.sql). Only exists when the game is opened in a server's voice
// channel; the server id comes from the Discord SDK (hooks/useDiscordSDK.ts registers it here).

const HIDDEN_KEY = "SERVER_BOARD_HIDDEN";
export const SERVER_BOARD_LIMIT = 10;

let guildId: string | null = null;

export function isValidGuildId(value: unknown): value is string {
	return typeof value === "string" && /^\d{5,25}$/.test(value);
}

export function setServerBoardGuild(id: unknown): void {
	guildId = isValidGuildId(id) ? id : null;
}

/** The Discord server the game runs in, or null (a DM, or not in Discord). */
export function getServerBoardGuild(): string | null {
	return guildId;
}

export interface ServerBoardRow {
	rank: number;
	player_name: string;
	avatar_url: string | null;
	score: number;
	is_me: boolean;
}

export interface ServerBoardView {
	/** The best players, best first (at most SERVER_BOARD_LIMIT). */
	top: ServerBoardRow[];
	/** The player's place and score, when they are on the table. */
	myRank: number | null;
	myScore: number | null;
	/** Points to the next better place and which place that is; null for the leader or when not on the table. */
	gap: { points: number; place: number } | null;
}

export function parseServerBoardRows(data: unknown): ServerBoardRow[] {
	if (!Array.isArray(data)) return [];
	const rows: ServerBoardRow[] = [];
	for (const item of data) {
		if (!item || typeof item !== "object") continue;
		const row = item as Record<string, unknown>;
		if (typeof row.rank !== "number" || typeof row.score !== "number") continue;
		rows.push({
			rank: row.rank,
			player_name: typeof row.player_name === "string" && row.player_name ? row.player_name : "Player",
			avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
			score: row.score,
			is_me: row.is_me === true,
		});
	}
	return rows.sort((a, b) => a.rank - b.rank);
}

/** Turns what the server returned (top rows, the player's row and the row above it) into what the screen shows. */
export function buildServerBoardView(rows: ServerBoardRow[], limit: number = SERVER_BOARD_LIMIT): ServerBoardView {
	const me = rows.find((row) => row.is_me) ?? null;
	const above = me ? rows.find((row) => row.rank === me.rank - 1) ?? null : null;
	return {
		top: rows.filter((row) => row.rank <= limit),
		myRank: me ? me.rank : null,
		myScore: me ? me.score : null,
		gap: me && above ? { points: Math.max(0, above.score - me.score), place: above.rank } : null,
	};
}

export function serverBoardToScores(view: ServerBoardView, board: SeasonBoard): GlobalHighScore[] {
	return view.top.map((row) => ({
		player_name: row.player_name,
		score: row.score,
		game_mode: board,
		avatar_url: row.avatar_url ?? undefined,
	}));
}

export async function fetchServerBoard(board: SeasonBoard): Promise<ServerBoardView | null> {
	if (!guildId) return null;
	try {
		const { data, error } = await supabase.rpc("get_guild_season_board", { p_guild: guildId, p_board: board, p_limit: SERVER_BOARD_LIMIT });
		if (error) return null;
		return buildServerBoardView(parseServerBoardRows(data));
	} catch {
		return null;
	}
}

export type GuildScoreSubmitter = (guild: string, board: SeasonBoard, score: number) => Promise<boolean>;

const submitToServer: GuildScoreSubmitter = async (guild, board, score) => {
	const { data, error } = await supabase.rpc("submit_guild_score", { p_guild: guild, p_board: board, p_score: Math.floor(score) });
	if (error) throw error;
	return data === true;
};

/** Sends a finished run to the server's table when the game is played in a Discord server. Best effort, never throws. */
export async function submitGuildScore(gameMode: string, score: number, submit: GuildScoreSubmitter = submitToServer): Promise<boolean> {
	const board = getSeasonBoard(gameMode);
	if (!guildId || !board || !Number.isFinite(score) || score <= 0) return false;
	try {
		return await submit(guildId, board, score);
	} catch {
		return false;
	}
}

/** "Hide me from the server table": the server keeps the flag, a copy is kept here so Options can show it at once. */
export async function getServerBoardHidden(): Promise<boolean> {
	try {
		const { data, error } = await supabase.rpc("get_server_board_hidden");
		if (!error && typeof data === "boolean") {
			await AsyncStorage.setItem(HIDDEN_KEY, data ? "true" : "false");
			return data;
		}
	} catch {
		// fall back to the local copy
	}
	try {
		return (await AsyncStorage.getItem(HIDDEN_KEY)) === "true";
	} catch {
		return false;
	}
}

export async function setServerBoardHidden(hidden: boolean): Promise<boolean> {
	try {
		const { data, error } = await supabase.rpc("set_server_board_hidden", { p_hidden: hidden });
		if (error || data !== true) return false;
		await AsyncStorage.setItem(HIDDEN_KEY, hidden ? "true" : "false");
		return true;
	} catch {
		return false;
	}
}
