import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { createClient, processLock, User } from '@supabase/supabase-js';
import { getStaleRoomCutoffs, ROOM_CLEANUP_RPC } from './Multiplayer';

// Supabase configuration
export const SUPABASE_URL = 'https://ptcglecvavdvpxadqfqd.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0Y2dsZWN2YXZkdnB4YWRxZnFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNDExODAsImV4cCI6MjA5NTcxNzE4MH0.ZL-xsoBqBTbcgZ-ZETyKzFtrJad0QgiSftBuDV5s_fE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
        lock: processLock,
    },
});

if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (state) => {
        if (state === 'active') {
            supabase.auth.startAutoRefresh();
        } else {
            supabase.auth.stopAutoRefresh();
        }
    });
}

export interface PlayerProfile {
    id: string;
    auth_user_id?: string | null;
    player_id?: string | null;
    player_name: string;
    email?: string | null;
    avatar_url?: string | null;
    coins?: number | null;
    elo?: number | null;
    owned_item_ids?: string[] | null;
    equipped?: Record<string, unknown> | null;
    updated_at?: string | null;
}

function escapeIlike(value: string): string {
    return value.replace(/[%_]/g, '\\$&');
}

function getUserDisplayName(user: User, preferredName?: string): string {
    const metadata = user.user_metadata || {};
    const candidate = [
        preferredName,
        metadata.player_name,
        metadata.name,
        metadata.full_name,
        user.email?.split('@')[0],
        `player_${user.id.slice(0, 6)}`,
    ].find((value) => typeof value === 'string' && value.trim().length > 0);

    return String(candidate).trim().slice(0, 20);
}

function getUserProviders(user: User): string[] {
    const providers = new Set<string>();
    const appProviders = user.app_metadata?.providers;
    if (Array.isArray(appProviders)) {
        appProviders.forEach((provider) => {
            if (typeof provider === 'string') providers.add(provider);
        });
    }
    user.identities?.forEach((identity) => {
        if (identity.provider) providers.add(identity.provider);
    });
    return [...providers];
}

function getUserAvatarUrl(user: User): string | null {
    const metadata = user.user_metadata || {};
    return (metadata.avatar_url || metadata.picture || null) as string | null;
}

async function getExistingProfileForAuthUser(userId: string): Promise<PlayerProfile | null> {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, auth_user_id, player_id, player_name, email, avatar_url, coins, elo, owned_item_ids, equipped, updated_at')
        .or(`auth_user_id.eq.${userId},player_id.eq.${userId}`)
        .limit(1);

    if (error) {
        console.error('Error fetching auth profile:', error);
        return null;
    }

    return (data?.[0] as PlayerProfile | undefined) || null;
}

async function getReusableProfileByName(playerName: string, userId: string): Promise<PlayerProfile | null> {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, auth_user_id, player_id, player_name, email, avatar_url, coins, elo, owned_item_ids, equipped, updated_at')
        .ilike('player_name', escapeIlike(playerName))
        .limit(1);

    if (error) {
        console.error('Error fetching named profile:', error);
        return null;
    }

    const profile = data?.[0] as PlayerProfile | undefined;
    if (!profile) return null;
    if (profile.auth_user_id && profile.auth_user_id !== userId) return null;
    return profile;
}

export async function upsertAuthenticatedProfile(user: User, preferredName?: string): Promise<PlayerProfile | null> {
    const baseName = getUserDisplayName(user, preferredName);
    const providers = getUserProviders(user);
    const payload = {
        auth_user_id: user.id,
        player_id: user.id,
        player_name: baseName,
        email: user.email ?? null,
        avatar_url: getUserAvatarUrl(user),
        login_providers: providers,
        last_login_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const byAuth = await getExistingProfileForAuthUser(user.id);
    const reusableByName = byAuth ? null : await getReusableProfileByName(baseName, user.id);
    const targetProfile = byAuth || reusableByName;

    if (targetProfile?.id) {
        const { data, error } = await supabase
            .from('profiles')
            .update(payload)
            .eq('id', targetProfile.id)
            .select('id, auth_user_id, player_id, player_name, email, avatar_url, coins, elo, owned_item_ids, equipped, updated_at')
            .single();

        if (error) {
            console.error('Error updating auth profile:', error);
            return targetProfile;
        }

        return data as PlayerProfile;
    }

    const { data, error } = await supabase
        .from('profiles')
        .insert(payload)
        .select('id, auth_user_id, player_id, player_name, email, avatar_url, coins, elo, owned_item_ids, equipped, updated_at')
        .single();

    if (error) {
        console.error('Error creating auth profile:', error);
        return null;
    }

    return data as PlayerProfile;
}

export interface GlobalHighScore {
    id?: number;
    player_name: string;
    score: number;
    game_mode: string;
    created_at?: string;
}

// Получить топ N глобальных рекордов
type HighScoreColumn = 'highscore_classic' | 'highscore_chaos' | 'highscore_time_attack' | 'highscore_daily';
type HighScoreProfileRow = {
    id?: string | number;
    player_name?: string;
    created_at?: string;
} & Partial<Record<HighScoreColumn, number>>;

const HIGH_SCORE_COLUMNS_SELECT = 'id, player_name, created_at, highscore_classic, highscore_chaos, highscore_time_attack, highscore_daily';

function getHighScoreColumn(gameMode: string): HighScoreColumn {
    return `highscore_${gameMode === 'daily_puzzle' ? 'daily' : gameMode}` as HighScoreColumn;
}

export async function getGlobalHighScores(
    gameMode: string,
    limit: number = 10
): Promise<GlobalHighScore[]> {
    try {
        const scoreColumn = getHighScoreColumn(gameMode);
        const { data, error } = await supabase
            .from('profiles')
            .select(HIGH_SCORE_COLUMNS_SELECT)
            .order(scoreColumn, { ascending: false })
            .limit(limit * 5); // Fetch extra to account for duplicates

        if (error) {
            console.error('Error fetching global high scores:', error);
            return [];
        }

        if (!data) return [];

        const rows = data as HighScoreProfileRow[];
        const uniquePlayers = new Set();
        const filteredData = rows.filter((record) => {
            if ((record[scoreColumn] || 0) <= 0) return false;
            // Case-insensitive duplicate check
            const lowerName = (record.player_name || '').toLowerCase();
            if (uniquePlayers.has(lowerName)) {
                return false;
            }
            uniquePlayers.add(lowerName);
            return true;
        });

        return filteredData.slice(0, limit).map((r) => ({
            id: typeof r.id === 'number' ? r.id : undefined,
            player_name: r.player_name || 'Player',
            score: r[scoreColumn] || 0,
            game_mode: gameMode,
            created_at: r.created_at
        }));
    } catch (error) {
        console.error('Error fetching global high scores:', error);
        return [];
    }
}

// Получить локальный/глобальный рекорд игрока
export async function getPlayerGlobalHighScore(
    playerName: string,
    gameMode: string
): Promise<number | null> {
    try {
        const finalPlayerName = playerName.trim();
        if (!finalPlayerName) return null;

        const escapedName = escapeIlike(finalPlayerName);
        const scoreColumn = getHighScoreColumn(gameMode);

        const { data, error } = await supabase
            .from('profiles')
            .select(HIGH_SCORE_COLUMNS_SELECT)
            .ilike('player_name', escapedName)
            .limit(1);

        if (error || !data || data.length === 0) {
            return null;
        }

        const row = (data as HighScoreProfileRow[])[0];
        return row[scoreColumn] ?? null;
    } catch (error) {
        console.error('Error fetching player global high score:', error);
        return null;
    }
}

export async function submitGlobalHighScore(
    playerName: string,
    score: number,
    gameMode: string
): Promise<boolean> {
    try {
        const finalPlayerName = playerName.trim();
        if (!finalPlayerName || score <= 0) return false;

        const escapedName = escapeIlike(finalPlayerName);
        const scoreColumn = getHighScoreColumn(gameMode);

        // Fetch existing profile
        const { data, error: fetchError } = await supabase
            .from('profiles')
            .select(HIGH_SCORE_COLUMNS_SELECT)
            .ilike('player_name', escapedName)
            .limit(1);

        if (fetchError) {
            console.error('Error fetching existing score:', fetchError);
            return false;
        }

        const existingRecord = (data as HighScoreProfileRow[] | null)?.[0];

        if (existingRecord) {
            const currentScore = existingRecord[scoreColumn] || 0;
            // Update if better score or if case mismatch
            if (score > currentScore) {
                const { error: updateError } = await supabase
                    .from('profiles')
                    .update({
                        player_name: finalPlayerName,
                        [scoreColumn]: score
                    })
                    .eq('id', existingRecord.id);

                if (updateError) return false;
            } else if (finalPlayerName !== existingRecord.player_name) {
                const { error: updateError } = await supabase
                    .from('profiles')
                    .update({ player_name: finalPlayerName })
                    .eq('id', existingRecord.id);

                if (updateError) return false;
            }
            return true;
        } else {
            // Profile doesn't exist, create it (offline/guest flow)
            const { error: insertError } = await supabase
                .from('profiles')
                .insert([{
                    player_name: finalPlayerName,
                    [scoreColumn]: score
                }]);

            if (insertError) return false;
            return true;
        }
    } catch (error) {
        console.error('Error submitting high score:', error);
        return false;
    }
}

export interface EloRating {
    id?: number | string;
    player_name: string;
    elo: number;
    updated_at?: string;
}

export async function submitEloRating(playerName: string, elo: number): Promise<boolean> {
    try {
        const finalPlayerName = playerName.trim();
        if (!finalPlayerName) return false;

        const escapedName = escapeIlike(finalPlayerName);

        const { data, error: fetchError } = await supabase
            .from('profiles')
            .select('id, elo')
            .ilike('player_name', escapedName)
            .limit(1);

        if (fetchError) {
            console.error('Error fetching existing profile elo:', fetchError);
            return false;
        }

        const existingRecord = data && data[0];

        if (existingRecord) {
            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    player_name: finalPlayerName,
                    elo: elo
                })
                .eq('id', existingRecord.id);

            if (updateError) return false;
        } else {
            const { error: insertError } = await supabase
                .from('profiles')
                .insert([{ player_name: finalPlayerName, elo: elo }]);

            if (insertError) return false;
        }
        return true;
    } catch (error) {
        console.error('Error submitting elo rating:', error);
        return false;
    }
}

export async function getPlayerElo(playerName: string): Promise<number | null> {
    try {
        const finalPlayerName = playerName.trim();
        if (!finalPlayerName) return null;

        const { data, error } = await supabase
            .from('profiles')
            .select('elo')
            .ilike('player_name', escapeIlike(finalPlayerName))
            .limit(1);

        if (error || !data || data.length === 0) {
            return null;
        }
        return data[0].elo;
    } catch (error) {
        console.error('Error fetching player elo:', error);
        return null;
    }
}

export async function getTopEloRatings(limit: number = 100): Promise<EloRating[]> {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, player_name, elo, updated_at')
            .order('elo', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Error fetching top elo ratings:', error);
            return [];
        }
        return data || [];
    } catch (error) {
        console.error('Error fetching top elo ratings:', error);
        return [];
    }
}

// Проверить, попал ли счет в топ N
export async function cleanupMatchmakingRooms(): Promise<boolean> {
    try {
        const { error } = await supabase.rpc(ROOM_CLEANUP_RPC);
        if (!error) return true;

        const message = `${error.code || ''} ${error.message || ''}`;
        const isMissingCleanupRpc = message.includes('PGRST202') ||
            message.includes(ROOM_CLEANUP_RPC) ||
            message.includes('Could not find the function');
        if (!isMissingCleanupRpc) {
            console.error('Error running matchmaking cleanup RPC:', error);
        }
    } catch (error) {
        console.error('Error calling matchmaking cleanup RPC:', error);
    }

    const cutoffs = getStaleRoomCutoffs();
    let success = true;

    const cleanupQueries = [
        supabase
            .from('matchmaking_rooms')
            .delete()
            .eq('status', 'waiting')
            .eq('is_private', false)
            .lt('created_at', cutoffs.publicWaiting),
        supabase
            .from('matchmaking_rooms')
            .delete()
            .eq('status', 'waiting')
            .eq('is_private', true)
            .lt('created_at', cutoffs.privateWaiting),
        supabase
            .from('matchmaking_rooms')
            .delete()
            .eq('status', 'playing')
            .lt('created_at', cutoffs.playing),
        supabase
            .from('matchmaking_rooms')
            .delete()
            .eq('status', 'finished')
            .lt('created_at', cutoffs.finished),
        supabase
            .from('matchmaking_rooms')
            .delete()
            .lt('created_at', cutoffs.absolute),
    ];

    for (const query of cleanupQueries) {
        const { error } = await query;
        if (error) {
            success = false;
            console.error('Error cleaning up matchmaking rooms:', error);
        }
    }

    return success;
}

export async function isTopScore(
    score: number,
    gameMode: string,
    topN: number = 100
): Promise<boolean> {
    try {
        const scoreColumn = getHighScoreColumn(gameMode);
        const { data, error } = await supabase
            .from('profiles')
            .select(HIGH_SCORE_COLUMNS_SELECT)
            .gt(scoreColumn, 0)
            .order(scoreColumn, { ascending: false })
            .limit(topN);

        if (error) {
            console.error('Error checking top score:', error);
            return true; // В случае ошибки разрешаем отправку
        }

        // Если записей меньше topN, то это точно топ
        if (!data || data.length < topN) {
            return true;
        }

        // Проверяем, больше ли наш счет минимального в топе
        const rows = data as HighScoreProfileRow[];
        const minTopScore = rows[rows.length - 1][scoreColumn] || 0;
        return score > minTopScore;
    } catch (error) {
        console.error('Error checking top score:', error);
        return true;
    }
}
