import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./Supabase";

// Three small tasks every day ("clear 15 lines", "beat the bot"). The device picks them from the date, counts
// progress locally and asks the server to pay: the reward table lives in the daily_quests migration, so the
// client only sends ids. Signed-in players only, like achievement rewards.

export type QuestKind = "lines" | "games" | "pieces" | "botWin" | "versus" | "moreWin" | "chessWin" | "durakWin" | "seaWin" | "puzzle" | "rescue" | "combo";

export interface QuestDefinition {
	id: string;
	kind: QuestKind;
	target: number;
	reward: number;
}

export const BONUS_QUEST_ID = "bonus";
export const BONUS_REWARD = 50;
export const QUESTS_PER_DAY = 3;

/** Ids and rewards are mirrored in the daily_quests migration; a jest test compares both. */
export const QUEST_POOL: QuestDefinition[] = [
	{ id: "lines_15", kind: "lines", target: 15, reward: 20 },
	{ id: "lines_40", kind: "lines", target: 40, reward: 40 },
	{ id: "games_2", kind: "games", target: 2, reward: 20 },
	{ id: "games_4", kind: "games", target: 4, reward: 40 },
	{ id: "pieces_40", kind: "pieces", target: 40, reward: 20 },
	{ id: "pieces_100", kind: "pieces", target: 100, reward: 40 },
	{ id: "botWin_1", kind: "botWin", target: 1, reward: 30 },
	{ id: "botWin_2", kind: "botWin", target: 2, reward: 50 },
	{ id: "versus_1", kind: "versus", target: 1, reward: 40 },
	{ id: "moreWin_1", kind: "moreWin", target: 1, reward: 30 },
	{ id: "moreWin_2", kind: "moreWin", target: 2, reward: 50 },
	{ id: "lines_25", kind: "lines", target: 25, reward: 30 },
	{ id: "lines_70", kind: "lines", target: 70, reward: 50 },
	{ id: "games_1", kind: "games", target: 1, reward: 10 },
	{ id: "games_3", kind: "games", target: 3, reward: 30 },
	{ id: "pieces_70", kind: "pieces", target: 70, reward: 30 },
	{ id: "pieces_150", kind: "pieces", target: 150, reward: 50 },
	{ id: "chessWin_1", kind: "chessWin", target: 1, reward: 30 },
	{ id: "chessWin_2", kind: "chessWin", target: 2, reward: 50 },
	{ id: "durakWin_1", kind: "durakWin", target: 1, reward: 30 },
	{ id: "seaWin_1", kind: "seaWin", target: 1, reward: 30 },
	{ id: "puzzle_1", kind: "puzzle", target: 1, reward: 30 },
	{ id: "puzzle_2", kind: "puzzle", target: 2, reward: 50 },
	{ id: "rescue_1", kind: "rescue", target: 1, reward: 30 },
	{ id: "rescue_2", kind: "rescue", target: 2, reward: 50 },
	{ id: "combo_1", kind: "combo", target: 1, reward: 30 },
	{ id: "combo_2", kind: "combo", target: 2, reward: 50 },
];

const QUEST_KINDS: QuestKind[] = ["lines", "games", "pieces", "botWin", "versus", "moreWin", "chessWin", "durakWin", "seaWin", "puzzle", "rescue", "combo"];
// How likely a kind is to be picked. Duels need a human opponent online, so they are rare while the player base is small.
const KIND_WEIGHT: Partial<Record<QuestKind, number>> = { versus: 0.25, durakWin: 0.6, seaWin: 0.6, chessWin: 0.8 };
// Quests anyone can finish alone and offline; every day has at least one of them.
const SOLO_KINDS: QuestKind[] = ["lines", "games", "pieces"];

const STATE_KEY = "DAILY_QUESTS_STATE";
const FLUSH_DELAY_MS = 600;

export function getQuestDefinition(id: string): QuestDefinition | undefined {
	return QUEST_POOL.find((quest) => quest.id === id);
}

/** Local calendar day, yyyy-mm-dd. */
export function questDayKey(now: Date = new Date()): string {
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	return `${now.getFullYear()}-${month}-${day}`;
}

function seededRandom(seed: string): () => number {
	let h = 2166136261;
	for (let i = 0; i < seed.length; i++) {
		h ^= seed.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return () => {
		h = Math.imul(h ^ (h >>> 15), 2246822069);
		h = Math.imul(h ^ (h >>> 13), 3266489917);
		h ^= h >>> 16;
		return (h >>> 0) / 4294967296;
	};
}

/** The same day gives the same three quests on every device. */
export function pickDailyQuests(day: string): QuestDefinition[] {
	const random = seededRandom(`blockerino-quests-${day}`);
	// weighted draw without repeats: each kind gets a key random()^(1/weight) and the three largest win
	const chosen = QUEST_KINDS
		.map((kind) => ({ kind, key: Math.pow(random(), 1 / (KIND_WEIGHT[kind] ?? 1)) }))
		.sort((a, b) => b.key - a.key)
		.slice(0, QUESTS_PER_DAY)
		.map((entry) => entry.kind);
	if (!chosen.some((kind) => SOLO_KINDS.includes(kind))) {
		chosen[QUESTS_PER_DAY - 1] = SOLO_KINDS[Math.floor(random() * SOLO_KINDS.length)];
	}
	return chosen.map((kind) => {
		const variants = QUEST_POOL.filter((quest) => quest.kind === kind);
		return variants[Math.floor(random() * variants.length)];
	});
}

interface StoredState {
	day: string;
	progress: Partial<Record<QuestKind, number>>;
	claimed: string[];
}

export interface QuestView extends QuestDefinition {
	current: number;
	complete: boolean;
	claimed: boolean;
}

export interface DailyQuestsView {
	day: string;
	quests: QuestView[];
	bonusReady: boolean;
	bonusClaimed: boolean;
	/** Coins waiting to be collected (finished quests plus the bonus when all are done). */
	claimableCoins: number;
	claimableIds: string[];
}

const listeners = new Set<() => void>();
export function subscribeToDailyQuests(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
function notify() {
	listeners.forEach((listener) => {
		try {
			listener();
		} catch (error) {
			console.error("Daily quests listener failed:", error);
		}
	});
}

function emptyState(day: string): StoredState {
	return { day, progress: {}, claimed: [] };
}

function asNumberMap(value: unknown): Partial<Record<QuestKind, number>> {
	const result: Partial<Record<QuestKind, number>> = {};
	if (!value || typeof value !== "object") return result;
	for (const kind of QUEST_KINDS) {
		const amount = (value as Record<string, unknown>)[kind];
		if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) result[kind] = Math.floor(amount);
	}
	return result;
}

async function readState(day: string): Promise<StoredState> {
	try {
		const raw = await AsyncStorage.getItem(STATE_KEY);
		if (!raw) return emptyState(day);
		const parsed = JSON.parse(raw);
		if (!parsed || parsed.day !== day) return emptyState(day);
		return {
			day,
			progress: asNumberMap(parsed.progress),
			claimed: Array.isArray(parsed.claimed) ? parsed.claimed.filter((id: unknown): id is string => typeof id === "string") : [],
		};
	} catch {
		return emptyState(day);
	}
}

async function writeState(state: StoredState): Promise<void> {
	try {
		await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
	} catch {
		// progress for one day is not worth failing a game over
	}
}

/** Pure: today's quests with their progress. */
export function buildQuestView(state: StoredState): DailyQuestsView {
	const quests = pickDailyQuests(state.day).map((quest) => {
		const current = Math.min(quest.target, state.progress[quest.kind] ?? 0);
		return { ...quest, current, complete: current >= quest.target, claimed: state.claimed.includes(quest.id) };
	});
	const bonusReady = quests.every((quest) => quest.complete);
	const bonusClaimed = state.claimed.includes(BONUS_QUEST_ID);
	const claimableIds = quests.filter((quest) => quest.complete && !quest.claimed).map((quest) => quest.id);
	// The bonus is only paid once every quest of the day was claimed, so it joins the list in the same call.
	const bonusJoins = bonusReady && !bonusClaimed;
	if (bonusJoins) claimableIds.push(BONUS_QUEST_ID);
	const claimableCoins =
		quests.filter((quest) => quest.complete && !quest.claimed).reduce((sum, quest) => sum + quest.reward, 0) +
		(bonusJoins ? BONUS_REWARD : 0);
	return { day: state.day, quests, bonusReady, bonusClaimed, claimableCoins, claimableIds };
}

export async function getDailyQuests(now: Date = new Date()): Promise<DailyQuestsView> {
	await flushQuestProgress();
	return buildQuestView(await readState(questDayKey(now)));
}

// Progress is collected in memory and written in one go, because a block placement calls this several times.
let pending: Partial<Record<QuestKind, number>> = {};
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushQueue: Promise<void> = Promise.resolve();

export function recordQuestProgress(kind: QuestKind, amount = 1): void {
	if (!Number.isFinite(amount) || amount <= 0) return;
	pending[kind] = (pending[kind] ?? 0) + Math.floor(amount);
	if (!flushTimer) {
		flushTimer = setTimeout(() => {
			void flushQuestProgress();
		}, FLUSH_DELAY_MS);
	}
}

export async function flushQuestProgress(): Promise<void> {
	if (flushTimer) {
		clearTimeout(flushTimer);
		flushTimer = null;
	}
	const batch = pending;
	pending = {};
	if (Object.keys(batch).length === 0) {
		await flushQueue;
		return;
	}
	flushQueue = flushQueue.catch(() => undefined).then(async () => {
		const state = await readState(questDayKey());
		for (const kind of QUEST_KINDS) {
			const add = batch[kind];
			if (add) state.progress[kind] = (state.progress[kind] ?? 0) + add;
		}
		await writeState(state);
		notify();
	});
	await flushQueue;
}

export interface QuestClaimResult {
	coins: number | null;
	granted: string[];
	claimed: string[];
}

export function parseQuestClaim(data: unknown): QuestClaimResult | null {
	if (!data || typeof data !== "object") return null;
	const row = data as Record<string, unknown>;
	if (row.status !== "ok") return null;
	const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
	return {
		coins: typeof row.coins === "number" && Number.isFinite(row.coins) ? row.coins : null,
		granted: list(row.granted),
		claimed: list(row.claimed),
	};
}

/** Null for guests and when the server cannot be reached. An empty list only reads what was claimed today. */
export async function claimDailyQuests(day: string, ids: string[]): Promise<QuestClaimResult | null> {
	try {
		const { data: { session } } = await supabase.auth.getSession();
		if (!session?.user) return null;
		const { data, error } = await supabase.rpc("claim_daily_quests", { p_day: day, p_ids: ids });
		if (error) return null;
		const result = parseQuestClaim(data);
		if (result) {
			await flushQuestProgress();
			const state = await readState(day);
			state.claimed = Array.from(new Set([...state.claimed, ...result.claimed]));
			await writeState(state);
			notify();
		}
		return result;
	} catch {
		return null;
	}
}
