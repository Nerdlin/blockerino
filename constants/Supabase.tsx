import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { createClient, processLock, User } from '@supabase/supabase-js';
import { getStaleRoomCutoffs, ROOM_CLEANUP_RPC } from './Multiplayer';

// Supabase configuration
function isDiscordEmbed(): boolean {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
    try {
        return window.self !== window.top;
    } catch {
        return true; // cross-origin iframe → likely Discord
    }
}

export const SUPABASE_URL = isDiscordEmbed()
    ? `${window.location.origin}/supabase`
    : 'https://ptcglecvavdvpxadqfqd.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0Y2dsZWN2YXZkdnB4YWRxZnFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNDExODAsImV4cCI6MjA5NTcxNzE4MH0.ZL-xsoBqBTbcgZ-ZETyKzFtrJad0QgiSftBuDV5s_fE';

const webStorage = {
    getItem: async (key: string) => {
        if (typeof window === 'undefined') return null;
        return window.localStorage.getItem(key);
    },
    setItem: async (key: string, value: string) => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(key, value);
    },
    removeItem: async (key: string) => {
        if (typeof window === 'undefined') return;
        window.localStorage.removeItem(key);
    },
};

function getSupabaseAuthStorage() {
    return Platform.OS === 'web' ? webStorage : AsyncStorage;
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: getSupabaseAuthStorage(),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
        flowType: 'pkce',
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
    // If profile is unclaimed or matches, reuse it; otherwise merge if email or name matches
    return profile;
}

export async function upsertAuthenticatedProfile(user: User, preferredName?: string): Promise<PlayerProfile | null> {
    const baseName = getUserDisplayName(user, preferredName);
    const providers = getUserProviders(user);
    let playerName = baseName;
    const byAuth = await getExistingProfileForAuthUser(user.id);
    const reusableByName = byAuth ? null : await getReusableProfileByName(baseName, user.id);
    const targetProfile = byAuth || reusableByName;

    const newAvatar = getUserAvatarUrl(user);
    const payload = {
        auth_user_id: user.id,
        player_id: user.id,
        player_name: playerName,
        email: user.email ?? null,
        avatar_url: newAvatar || targetProfile?.avatar_url || null,
        login_providers: providers,
        last_login_at: new Date().toISOString(),
    } as any;

    let resultData = null;
    let attempt = 0;
    const MAX_ATTEMPTS = 5;

    while (attempt < MAX_ATTEMPTS) {
        payload.player_name = playerName;

        if (targetProfile?.id) {
            const { data, error } = await supabase
                .from('profiles')
                .update(payload)
                .eq('id', targetProfile.id)
                .select('id, auth_user_id, player_id, player_name, email, avatar_url, coins, elo, owned_item_ids, equipped, updated_at')
                .single();

            if (error) {
                if (error.code === '23505' && error.message.includes('profiles_player_name_key')) {
                    playerName = `${baseName.slice(0, 15)}_${Math.floor(Math.random() * 10000)}`;
                    attempt++;
                    continue;
                }
                console.error('Error updating auth profile:', error);
                return targetProfile;
            }
            resultData = data;
            break;
        } else {
            const { data, error } = await supabase
                .from('profiles')
                .insert({ ...payload, updated_at: new Date().toISOString() })
                .select('id, auth_user_id, player_id, player_name, email, avatar_url, coins, elo, owned_item_ids, equipped, updated_at')
                .single();

            if (error) {
                if (error.code === '23505' && error.message.includes('profiles_player_name_key')) {
                    playerName = `${baseName.slice(0, 15)}_${Math.floor(Math.random() * 10000)}`;
                    attempt++;
                    continue;
                }
                console.error('Error creating auth profile:', error);
                return null;
            }
            resultData = data;
            break;
        }
    }

    return (resultData as PlayerProfile) || null;
}

export async function updateProfileAvatar(userId: string, avatarUrl: string | null): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('profiles')
            .update({ avatar_url: avatarUrl })
            .eq('auth_user_id', userId);
        
        if (error) {
            console.error('Error updating profile avatar:', error);
            return false;
        }
        return true;
    } catch (e) {
        console.error('Exception updating profile avatar:', e);
        return false;
    }
}

export interface GlobalHighScore {
	id?: number;
	player_name: string;
	score: number;
	game_mode: string;
	created_at?: string;
	avatar_url?: string;
}

// Получить топ N глобальных рекордов
type HighScoreColumn = 'highscore_classic' | 'highscore_chaos' | 'highscore_time_attack' | 'highscore_daily' | 'highscore_move_limit';
type HighScoreProfileRow = {
	id?: string | number;
	player_name?: string;
	avatar_url?: string;
	created_at?: string;
} & Partial<Record<HighScoreColumn, number>>;
const MISSING_HIGH_SCORE_COLUMN_RETRY_MS = 5 * 60 * 1000;
const missingHighScoreColumnRetryAt: Partial<Record<HighScoreColumn, number>> = {};

function getHighScoreColumnsSelect(scoreColumn: HighScoreColumn): string {
    return `id, player_name, avatar_url, created_at, ${scoreColumn}`;
}

function getHighScoreColumn(gameMode: string): HighScoreColumn {
    if (gameMode === 'daily_puzzle') return 'highscore_daily';
    return `highscore_${gameMode}` as HighScoreColumn;
}

function isMissingHighScoreColumnError(error: unknown, scoreColumn: HighScoreColumn): boolean {
    const err = error as { code?: string; message?: string; details?: string; hint?: string } | null;
    const message = `${err?.code || ''} ${err?.message || ''} ${err?.details || ''} ${err?.hint || ''}`.toLowerCase();
    return message.includes(scoreColumn.toLowerCase()) && (
        message.includes('42703') ||
        message.includes('does not exist') ||
        message.includes('could not find')
    );
}

function isHighScoreColumnTemporarilyUnavailable(scoreColumn: HighScoreColumn): boolean {
    const retryAt = missingHighScoreColumnRetryAt[scoreColumn];
    if (!retryAt) return false;

    if (Date.now() >= retryAt) {
        delete missingHighScoreColumnRetryAt[scoreColumn];
        return false;
    }

    return true;
}

function rememberMissingHighScoreColumn(scoreColumn: HighScoreColumn): void {
    missingHighScoreColumnRetryAt[scoreColumn] = Date.now() + MISSING_HIGH_SCORE_COLUMN_RETRY_MS;
}

export async function getGlobalHighScores(
    gameMode: string,
    limit: number = 10
): Promise<GlobalHighScore[]> {
    try {
        const scoreColumn = getHighScoreColumn(gameMode);
        if (isHighScoreColumnTemporarilyUnavailable(scoreColumn)) return [];

        const { data, error } = await supabase
            .from('profiles')
            .select(getHighScoreColumnsSelect(scoreColumn))
            .order(scoreColumn, { ascending: false })
            .limit(limit * 5); // Fetch extra to account for duplicates

        if (error) {
            if (isMissingHighScoreColumnError(error, scoreColumn)) {
                rememberMissingHighScoreColumn(scoreColumn);
                return [];
            }
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
            created_at: r.created_at,
            avatar_url: r.avatar_url
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
        if (isHighScoreColumnTemporarilyUnavailable(scoreColumn)) return null;

        const { data, error } = await supabase
            .from('profiles')
            .select(getHighScoreColumnsSelect(scoreColumn))
            .ilike('player_name', escapedName)
            .limit(1);

        if (error || !data || data.length === 0) {
            if (error && isMissingHighScoreColumnError(error, scoreColumn)) {
                rememberMissingHighScoreColumn(scoreColumn);
                return null;
            }
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
        if (isHighScoreColumnTemporarilyUnavailable(scoreColumn)) return false;

        // Fetch existing profile
        const { data, error: fetchError } = await supabase
            .from('profiles')
            .select(getHighScoreColumnsSelect(scoreColumn))
            .ilike('player_name', escapedName)
            .limit(1);

        if (fetchError) {
            if (isMissingHighScoreColumnError(fetchError, scoreColumn)) {
                rememberMissingHighScoreColumn(scoreColumn);
                return false;
            }
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

                if (updateError) {
                    if (isMissingHighScoreColumnError(updateError, scoreColumn)) {
                        rememberMissingHighScoreColumn(scoreColumn);
                    }
                    return false;
                }
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

            if (insertError) {
                if (isMissingHighScoreColumnError(insertError, scoreColumn)) {
                    rememberMissingHighScoreColumn(scoreColumn);
                }
                return false;
            }
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
    avatar_url?: string | null;
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

export async function getPlayerProfileData(playerName: string): Promise<{ elo: number, avatar_url: string | null } | null> {
    try {
        const finalPlayerName = playerName.trim();
        if (!finalPlayerName) return null;

        const { data, error } = await supabase
            .from('profiles')
            .select('elo, avatar_url')
            .ilike('player_name', escapeIlike(finalPlayerName))
            .limit(1);

        if (error || !data || data.length === 0) {
            return null;
        }
        return { elo: data[0].elo, avatar_url: data[0].avatar_url };
    } catch (error) {
        console.error('Error fetching player profile data:', error);
        return null;
    }
}

export async function getTopEloRatings(limit: number = 100): Promise<EloRating[]> {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, player_name, avatar_url, elo, updated_at')
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
export type MoreGameRatingGameId = 'battleship' | 'durak' | 'chess' | 'tictactoe' | 'sudoku' | 'mahjong';
export type MoreGameMatchResult = 'player1' | 'player2' | 'draw';

export interface MoreGameRating {
    id?: string;
    game_id: MoreGameRatingGameId;
    player_key?: string;
    player_name: string;
    elo: number;
    wins: number;
    losses: number;
    draws: number;
    games_played: number;
    last_result?: 'win' | 'loss' | 'draw' | null;
    last_played_at?: string | null;
    updated_at?: string | null;
    avatar_url?: string | null;
}

export interface MoreGameRatingResult extends MoreGameRating {
    old_elo?: number;
    elo_change?: number;
}

function normalizeMoreGameName(playerName: string): string {
    return playerName.trim().slice(0, 24);
}

function isMoreGameRatingsUnavailable(error: unknown): boolean {
    const err = error as { code?: string; message?: string; details?: string; hint?: string } | null;
    const message = `${err?.code || ''} ${err?.message || ''} ${err?.details || ''} ${err?.hint || ''}`.toLowerCase();
    return message.includes('more_game_ratings') ||
        message.includes('record_more_game_match') ||
        message.includes('record_more_game_solo_result') ||
        message.includes('pgrst202') ||
        message.includes('42p01') ||
        message.includes('does not exist') ||
        message.includes('could not find');
}

export async function getMoreGameLeaderboard(
    gameId: MoreGameRatingGameId,
    limit: number = 100
): Promise<MoreGameRating[]> {
    try {
        const { data, error } = await supabase
            .from('more_game_ratings')
            .select('id, game_id, player_key, player_name, elo, wins, losses, draws, games_played, last_result, last_played_at, updated_at')
            .eq('game_id', gameId)
            .order('elo', { ascending: false })
            .order('updated_at', { ascending: false })
            .limit(limit);

        if (error) {
            if (!isMoreGameRatingsUnavailable(error)) {
                console.error('Error fetching more game leaderboard:', error);
            }
            return [];
        }

        const ratings = (data || []) as MoreGameRating[];
        
        if (ratings.length > 0) {
            const playerNames = ratings.map(r => r.player_name);
            const { data: profiles } = await supabase
                .from('profiles')
                .select('player_name, avatar_url')
                .in('player_name', playerNames);
                
            if (profiles) {
                const avatarMap = new Map(profiles.map(p => [p.player_name.toLowerCase(), p.avatar_url]));
                ratings.forEach(r => {
                    r.avatar_url = avatarMap.get(r.player_name.toLowerCase()) || null;
                });
            }
        }
        
        return ratings;
    } catch (error) {
        console.error('Error fetching more game leaderboard:', error);
        return [];
    }
}

export async function getPlayerMoreGameRating(
    playerName: string,
    gameId: MoreGameRatingGameId
): Promise<MoreGameRating | null> {
    try {
        const finalPlayerName = normalizeMoreGameName(playerName);
        if (!finalPlayerName) return null;

        const { data, error } = await supabase
            .from('more_game_ratings')
            .select('id, game_id, player_key, player_name, elo, wins, losses, draws, games_played, last_result, last_played_at, updated_at')
            .eq('game_id', gameId)
            .eq('player_key', finalPlayerName.toLowerCase())
            .limit(1);

        if (error) {
            if (!isMoreGameRatingsUnavailable(error)) {
                console.error('Error fetching more game rating:', error);
            }
            return null;
        }

        return ((data || []) as MoreGameRating[])[0] || null;
    } catch (error) {
        console.error('Error fetching more game rating:', error);
        return null;
    }
}

export async function submitMoreGameMatchResult({
    gameId,
    player1Name,
    player2Name,
    result,
    roomCode,
    metadata = {},
}: {
    gameId: MoreGameRatingGameId;
    player1Name: string;
    player2Name: string;
    result: MoreGameMatchResult;
    roomCode?: string;
    metadata?: Record<string, unknown>;
}): Promise<MoreGameRatingResult[]> {
    try {
        const finalPlayer1Name = normalizeMoreGameName(player1Name);
        const finalPlayer2Name = normalizeMoreGameName(player2Name);
        if (!finalPlayer1Name || !finalPlayer2Name || finalPlayer1Name.toLowerCase() === finalPlayer2Name.toLowerCase()) return [];

        const { data, error } = await supabase.rpc('record_more_game_match', {
            p_game_id: gameId,
            p_player1_name: finalPlayer1Name,
            p_player2_name: finalPlayer2Name,
            p_result: result,
            p_room_code: roomCode || null,
            p_metadata: metadata,
        });

        if (error) {
            if (!isMoreGameRatingsUnavailable(error)) {
                console.error('Error submitting more game match result:', error);
            }
            return [];
        }

        return (data || []) as MoreGameRatingResult[];
    } catch (error) {
        console.error('Error submitting more game match result:', error);
        return [];
    }
}

export async function submitMoreGameSoloResult({
    gameId,
    playerName,
    won = true,
    score,
    metadata = {},
}: {
    gameId: Extract<MoreGameRatingGameId, 'sudoku' | 'mahjong'>;
    playerName: string;
    won?: boolean;
    score?: number;
    metadata?: Record<string, unknown>;
}): Promise<MoreGameRatingResult | null> {
    try {
        const finalPlayerName = normalizeMoreGameName(playerName);
        if (!finalPlayerName) return null;

        const { data, error } = await supabase.rpc('record_more_game_solo_result', {
            p_game_id: gameId,
            p_player_name: finalPlayerName,
            p_won: won,
            p_score: typeof score === 'number' ? score : null,
            p_metadata: metadata,
        });

        if (error) {
            if (!isMoreGameRatingsUnavailable(error)) {
                console.error('Error submitting more game solo result:', error);
            }
            return null;
        }

        return ((data || []) as MoreGameRatingResult[])[0] || null;
    } catch (error) {
        console.error('Error submitting more game solo result:', error);
        return null;
    }
}

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
        if (isHighScoreColumnTemporarilyUnavailable(scoreColumn)) return false;

        const { data, error } = await supabase
            .from('profiles')
            .select(getHighScoreColumnsSelect(scoreColumn))
            .gt(scoreColumn, 0)
            .order(scoreColumn, { ascending: false })
            .limit(topN);

        if (error) {
            if (isMissingHighScoreColumnError(error, scoreColumn)) {
                rememberMissingHighScoreColumn(scoreColumn);
                return false;
            }
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
