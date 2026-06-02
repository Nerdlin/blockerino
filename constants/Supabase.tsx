import { createClient } from '@supabase/supabase-js';
import { getStaleRoomCutoffs, ROOM_CLEANUP_RPC } from './Multiplayer';

// Supabase configuration
const SUPABASE_URL = 'https://ptcglecvavdvpxadqfqd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0Y2dsZWN2YXZkdnB4YWRxZnFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNDExODAsImV4cCI6MjA5NTcxNzE4MH0.ZL-xsoBqBTbcgZ-ZETyKzFtrJad0QgiSftBuDV5s_fE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface GlobalHighScore {
    id?: number;
    player_name: string;
    score: number;
    game_mode: string;
    created_at?: string;
}

// Получить топ N глобальных рекордов
export async function getGlobalHighScores(
    gameMode: string,
    limit: number = 10
): Promise<GlobalHighScore[]> {
    try {
        const { data, error } = await supabase
            .from('high_scores')
            .select('*')
            .eq('game_mode', gameMode)
            .order('score', { ascending: false })
            .limit(limit * 5); // Fetch extra to account for duplicates

        if (error) {
            console.error('Error fetching global high scores:', error);
            return [];
        }

        if (!data) return [];

        const uniquePlayers = new Set();
        const filteredData = data.filter(record => {
            // Case-insensitive duplicate check
            const lowerName = record.player_name.toLowerCase();
            if (uniquePlayers.has(lowerName)) {
                return false;
            }
            uniquePlayers.add(lowerName);
            return true;
        });

        return filteredData.slice(0, limit);
    } catch (error) {
        console.error('Error fetching global high scores:', error);
        return [];
    }
}

// Добавить новый рекорд в глобальную таблицу (с защитой от дубликатов)
export async function getPlayerGlobalHighScore(
    playerName: string,
    gameMode: string
): Promise<number | null> {
    try {
        const finalPlayerName = playerName.trim();
        if (!finalPlayerName) return null;

        const escapedName = finalPlayerName.replace(/[%_]/g, '\\$&');
        const { data, error } = await supabase
            .from('high_scores')
            .select('score')
            .ilike('player_name', escapedName)
            .eq('game_mode', gameMode)
            .order('score', { ascending: false })
            .limit(1);

        if (error || !data || data.length === 0) {
            return null;
        }

        return data[0].score;
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
        // Экранируем спецсимволы в имени для case-insensitive LIKE поиска
        const finalPlayerName = playerName.trim();
        if (!finalPlayerName || score <= 0) return false;

        const escapedName = finalPlayerName.replace(/[%_]/g, '\\$&');

        // Проверяем, существует ли уже запись для этого игрока в этом режиме (без учета регистра)
        const { data, error: fetchError } = await supabase
            .from('high_scores')
            .select('id, score, player_name')
            .ilike('player_name', escapedName)
            .eq('game_mode', gameMode)
            .limit(1);

        if (fetchError) {
            console.error('Error fetching existing score:', fetchError);
            return false;
        }

        const existingRecord = data && data[0];

        if (existingRecord) {
            // Если новый результат лучше, обновляем его и имя (вдруг изменился регистр)
            if (score > existingRecord.score) {
                const { error: updateError } = await supabase
                    .from('high_scores')
                    .update({
                        player_name: finalPlayerName,
                        score: score,
                        created_at: new Date().toISOString()
                    })
                    .eq('id', existingRecord.id);

                if (updateError) {
                    console.error('Error updating high score:', updateError);
                    return false;
                }
            } else if (finalPlayerName !== existingRecord.player_name) {
                // Если счет не лучше, но изменился регистр/написание имени, обновляем имя в БД
                const { error: updateError } = await supabase
                    .from('high_scores')
                    .update({
                        player_name: finalPlayerName
                    })
                    .eq('id', existingRecord.id);

                if (updateError) {
                    console.error('Error updating player name:', updateError);
                    return false;
                }
            }
            return true;
        } else {
            // Если записи нет, создаем новую
            const { error: insertError } = await supabase
                .from('high_scores')
                .insert([
                    {
                        player_name: finalPlayerName,
                        score: score,
                        game_mode: gameMode
                    }
                ]);

            if (insertError) {
                console.error('Error inserting high score:', insertError);
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
    id?: number;
    player_name: string;
    elo: number;
    updated_at?: string;
}

export async function submitEloRating(playerName: string, elo: number): Promise<boolean> {
    try {
        const finalPlayerName = playerName.trim();
        if (!finalPlayerName) return false;

        const escapedName = finalPlayerName.replace(/[%_]/g, '\\$&');

        const { data, error: fetchError } = await supabase
            .from('elo_ratings')
            .select('id, elo')
            .ilike('player_name', escapedName)
            .limit(1);

        if (fetchError) {
            console.error('Error fetching existing elo:', fetchError);
            return false;
        }

        const existingRecord = data && data[0];

        if (existingRecord) {
            const { error: updateError } = await supabase
                .from('elo_ratings')
                .update({
                    player_name: finalPlayerName,
                    elo: elo,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingRecord.id);

            if (updateError) {
                console.error('Error updating elo rating:', updateError);
                return false;
            }
        } else {
            const { error: insertError } = await supabase
                .from('elo_ratings')
                .insert([{ player_name: finalPlayerName, elo: elo }]);

            if (insertError) {
                console.error('Error inserting elo rating:', insertError);
                return false;
            }
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
            .from('elo_ratings')
            .select('elo')
            .ilike('player_name', finalPlayerName.replace(/[%_]/g, '\\$&'))
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
            .from('elo_ratings')
            .select('*')
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
        const { data, error } = await supabase
            .from('high_scores')
            .select('score')
            .eq('game_mode', gameMode)
            .order('score', { ascending: false })
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
        const minTopScore = data[data.length - 1].score;
        return score > minTopScore;
    } catch (error) {
        console.error('Error checking top score:', error);
        return true;
    }
}
