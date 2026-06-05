import AsyncStorage from "@react-native-async-storage/async-storage";

export interface StoredMatchHistoryItem {
	id: string;
	room_id: string;
	winner_id: string | null;
	player1_id: string;
	player2_id: string;
	player1_score: number;
	player2_score: number;
	player1_elo_change: number;
	player2_elo_change: number;
	created_at: string;
}

const MATCH_HISTORY_KEY = "MATCH_HISTORY";
const MAX_LOCAL_MATCH_HISTORY = 50;

async function readAllLocalMatchHistory(): Promise<StoredMatchHistoryItem[]> {
	try {
		const raw = await AsyncStorage.getItem(MATCH_HISTORY_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch (error) {
		console.error("Error loading local match history:", error);
		return [];
	}
}

async function writeAllLocalMatchHistory(history: StoredMatchHistoryItem[]) {
	await AsyncStorage.setItem(
		MATCH_HISTORY_KEY,
		JSON.stringify(history.slice(0, MAX_LOCAL_MATCH_HISTORY))
	);
}

export async function recordLocalMatchHistory(entry: Omit<StoredMatchHistoryItem, "id" | "created_at"> & Partial<Pick<StoredMatchHistoryItem, "id" | "created_at">>) {
	const createdAt = entry.created_at || new Date().toISOString();
	const nextEntry: StoredMatchHistoryItem = {
		...entry,
		id: entry.id || `${entry.room_id}:${createdAt}`,
		created_at: createdAt,
	};

	const existing = await readAllLocalMatchHistory();
	const withoutDuplicate = existing.filter((item) => item.id !== nextEntry.id && item.room_id !== nextEntry.room_id);
	await writeAllLocalMatchHistory([nextEntry, ...withoutDuplicate]);
}

export async function getLocalMatchHistory(userId: string): Promise<StoredMatchHistoryItem[]> {
	const history = await readAllLocalMatchHistory();
	return history
		.filter((match) => match.player1_id === userId || match.player2_id === userId)
		.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}
