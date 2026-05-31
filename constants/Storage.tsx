import { GameModeType } from '@/hooks/useAppState';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Board } from './Board';
import { Hand } from './Hand';

const highScoresKey = "HIGH_SCORES";

export type HighScoreId = string;

function createHighScoreId(): HighScoreId {
    // too big?
    return Crypto.randomUUID();
}

export interface HighScore {
    score: number,
    date: number,
    type: GameModeType
}

async function getHighScoreKeys(): Promise<HighScoreId[]> {
    const value = await AsyncStorage.getItem(highScoresKey);
    if (value == null) {
        return [];
    }
    return JSON.parse(value) as HighScoreId[];
}

export async function getHighScores(gameMode: GameModeType, filterZeroes: boolean = true, sort: boolean = true, limit: number = 0): Promise<HighScore[]> {
    const keys = await getHighScoreKeys();
    let scores = [];
    for (const key of keys) {
        const entry = await AsyncStorage.getItem(key);
        if (!entry)
            continue;
        const score = JSON.parse(entry) as HighScore;
        if (gameMode == score.type && (!filterZeroes || score.score != 0))
            scores.push(score);
    }
    if (sort)
        scores.sort((a, b) => -(a.score - b.score))
    if (limit > 0 && scores.length > limit)
        scores = scores.splice(0, limit);
    return scores;
}

export async function updateHighScore(key: HighScoreId, score: HighScore) {
    AsyncStorage.setItem(key, JSON.stringify(score));
}

export async function createHighScore(score: HighScore): Promise<HighScoreId> {
    const highScoreKeys = await getHighScoreKeys();
    const id = createHighScoreId();
    highScoreKeys.push(id);
    AsyncStorage.setItem(highScoresKey, JSON.stringify(highScoreKeys));
    AsyncStorage.setItem(id, JSON.stringify(score));
    return id;
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
    recyclesUsed?: number;
}

export async function saveActiveGame(state: SavedGameState): Promise<void> {
    try {
        await AsyncStorage.setItem(ACTIVE_GAME_KEY, JSON.stringify(state));
    } catch (e) {
        console.error("Error saving active game:", e);
    }
}

export async function getActiveGame(): Promise<SavedGameState | null> {
    try {
        const val = await AsyncStorage.getItem(ACTIVE_GAME_KEY);
        return val ? (JSON.parse(val) as SavedGameState) : null;
    } catch (e) {
        console.error("Error getting active game:", e);
        return null;
    }
}

export async function clearActiveGame(): Promise<void> {
    try {
        await AsyncStorage.removeItem(ACTIVE_GAME_KEY);
    } catch (e) {
        console.error("Error clearing active game:", e);
    }
}