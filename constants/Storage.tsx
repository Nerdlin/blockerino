import { GameModeType } from '@/hooks/useAppState';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Board } from './Board';
import { getDailyPuzzleKey, Hand } from './Hand';
import { supabase } from './Supabase';

const highScoresKey = "HIGH_SCORES";
const HIGH_SCORE_UPDATE_DEBOUNCE_MS = 250;
const ACTIVE_GAME_SAVE_DEBOUNCE_MS = 250;

export type HighScoreId = string;

function createHighScoreId(): HighScoreId {
    // too big?
    return Crypto.randomUUID();
}

export interface HighScore {
    ownerUserId?: string | null,
    score: number,
    date: number,
    type: GameModeType
}

const pendingHighScoreUpdates = new Map<HighScoreId, HighScore>();
const highScoreUpdateTimers = new Map<HighScoreId, ReturnType<typeof setTimeout>>();
let highScoreUpdateQueue: Promise<void> = Promise.resolve();

async function getHighScoreKeys(): Promise<HighScoreId[]> {
    const value = await AsyncStorage.getItem(highScoresKey);
    if (value == null) {
        return [];
    }
    return JSON.parse(value) as HighScoreId[];
}

export async function getHighScores(gameMode: GameModeType, filterZeroes: boolean = true, sort: boolean = true, limit: number = 0): Promise<HighScore[]> {
    await flushHighScoreUpdates();
    const keys = await getHighScoreKeys();
    let scores = [];
    for (const key of keys) {
        const entry = await AsyncStorage.getItem(key);
        if (!entry)
            continue;
        const score = JSON.parse(entry) as HighScore;
        if (gameMode === score.type && (!filterZeroes || score.score !== 0))
            scores.push(score);
    }
    if (sort)
        scores.sort((a, b) => -(a.score - b.score))
    if (limit > 0 && scores.length > limit)
        scores = scores.splice(0, limit);
    return scores;
}

async function persistHighScoreUpdate(key: HighScoreId, score: HighScore): Promise<void> {
    highScoreUpdateQueue = highScoreUpdateQueue.catch(() => undefined).then(async () => {
        const previous = await AsyncStorage.getItem(key);
        const ownerUserId = previous ? (JSON.parse(previous) as HighScore).ownerUserId : score.ownerUserId;
        return AsyncStorage.setItem(key, JSON.stringify({ ...score, ownerUserId }));
    });
    await highScoreUpdateQueue;
}

export async function flushHighScoreUpdates(): Promise<void> {
    for (const timer of highScoreUpdateTimers.values()) {
        clearTimeout(timer);
    }
    highScoreUpdateTimers.clear();

    const updates = [...pendingHighScoreUpdates.entries()];
    pendingHighScoreUpdates.clear();

    for (const [key, score] of updates) {
        await persistHighScoreUpdate(key, score);
    }

    await highScoreUpdateQueue;
}

export async function updateHighScore(
    key: HighScoreId,
    score: HighScore,
    options: { immediate?: boolean } = {}
): Promise<void> {
    pendingHighScoreUpdates.set(key, score);

    if (options.immediate) {
        await flushHighScoreUpdates();
        return;
    }

    const existingTimer = highScoreUpdateTimers.get(key);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }

    highScoreUpdateTimers.set(key, setTimeout(() => {
        highScoreUpdateTimers.delete(key);
        const pendingScore = pendingHighScoreUpdates.get(key);
        if (!pendingScore) return;

        pendingHighScoreUpdates.delete(key);
        void persistHighScoreUpdate(key, pendingScore).catch((error) => {
            console.error("Error saving high score:", error);
        });
    }, HIGH_SCORE_UPDATE_DEBOUNCE_MS));
}

export async function createHighScore(score: HighScore): Promise<HighScoreId> {
    const { data: { session } } = await supabase.auth.getSession();
    score = { ...score, ownerUserId: session?.user.id ?? null };
    const highScoreKeys = await getHighScoreKeys();
    const id = createHighScoreId();
    highScoreKeys.push(id);
    await AsyncStorage.setItem(highScoresKey, JSON.stringify(highScoreKeys));
    await AsyncStorage.setItem(id, JSON.stringify(score));
    return id;
}

export async function getOwnedHighScores(gameMode: GameModeType, userId: string): Promise<HighScore[]> {
    await flushHighScoreUpdates();
    const scores: HighScore[] = [];
    for (const key of await getHighScoreKeys()) {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) continue;
        const score = JSON.parse(raw) as HighScore;
        if (score.type !== gameMode) continue;
        // Claim legacy/guest records once, so switching accounts cannot copy them again.
        if (!score.ownerUserId) {
            score.ownerUserId = userId;
            await AsyncStorage.setItem(key, JSON.stringify(score));
        }
        if (score.ownerUserId === userId) scores.push(score);
    }
    return scores.sort((a, b) => b.score - a.score);
}

const ACTIVE_GAME_KEY = "ACTIVE_GAME";

export interface SavedGameState {
    gameMode: GameModeType;
    board: Board;
    hand: Hand;
    score: number;
    combo: number;
    lastBrokenLine: number;
    scoreStorageId: string | undefined;
    timeRemaining?: number;
    movesRemaining?: number;
    handCount?: number;
    recyclesUsed?: number;
    dailyKey?: string;
    secondChancesUsed?: number;
}

let pendingActiveGameState: SavedGameState | null = null;
let activeGameSaveTimer: ReturnType<typeof setTimeout> | null = null;
let activeGameSaveQueue: Promise<void> = Promise.resolve();

async function persistActiveGameState(state: SavedGameState): Promise<void> {
    activeGameSaveQueue = activeGameSaveQueue.catch(() => undefined).then(() => {
        return AsyncStorage.setItem(ACTIVE_GAME_KEY, JSON.stringify(state));
    });
    await activeGameSaveQueue;
}

export async function flushActiveGameSave(): Promise<void> {
    if (activeGameSaveTimer) {
        clearTimeout(activeGameSaveTimer);
        activeGameSaveTimer = null;
    }

    if (!pendingActiveGameState) {
        await activeGameSaveQueue;
        return;
    }

    const state = pendingActiveGameState;
    pendingActiveGameState = null;
    await persistActiveGameState(state);
}

export async function saveActiveGame(
    state: SavedGameState,
    options: { immediate?: boolean } = {}
): Promise<void> {
    try {
        pendingActiveGameState = state;

        if (options.immediate) {
            await flushActiveGameSave();
            return;
        }

        if (activeGameSaveTimer) {
            clearTimeout(activeGameSaveTimer);
        }

        activeGameSaveTimer = setTimeout(() => {
            void flushActiveGameSave().catch((error) => {
                console.error("Error saving active game:", error);
            });
        }, ACTIVE_GAME_SAVE_DEBOUNCE_MS);
    } catch (e) {
        console.error("Error saving active game:", e);
    }
}

export async function getActiveGame(): Promise<SavedGameState | null> {
    try {
        await flushActiveGameSave();
        const val = await AsyncStorage.getItem(ACTIVE_GAME_KEY);
        if (!val) {
            return null;
        }

        const state = JSON.parse(val) as SavedGameState;
        if (state.gameMode === GameModeType.DailyPuzzle && state.dailyKey !== getDailyPuzzleKey()) {
            await AsyncStorage.removeItem(ACTIVE_GAME_KEY);
            return null;
        }

        return state;
    } catch (e) {
        console.error("Error getting active game:", e);
        return null;
    }
}

export async function clearActiveGame(): Promise<void> {
    try {
        if (activeGameSaveTimer) {
            clearTimeout(activeGameSaveTimer);
            activeGameSaveTimer = null;
        }
        pendingActiveGameState = null;
        await activeGameSaveQueue;
        await AsyncStorage.removeItem(ACTIVE_GAME_KEY);
    } catch (e) {
        console.error("Error clearing active game:", e);
    }
}
