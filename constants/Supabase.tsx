import { createClient } from '@supabase/supabase-js';

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
export async function submitGlobalHighScore(
    playerName: string,
    score: number,
    gameMode: string
): Promise<boolean> {
    try {
        // Экранируем спецсимволы в имени для case-insensitive LIKE поиска
        const escapedName = playerName.replace(/[%_]/g, '\\$&');

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
                        player_name: playerName,
                        score: score,
                        created_at: new Date().toISOString()
                    })
                    .eq('id', existingRecord.id);

                if (updateError) {
                    console.error('Error updating high score:', updateError);
                    return false;
                }
            } else if (playerName !== existingRecord.player_name) {
                // Если счет не лучше, но изменился регистр/написание имени, обновляем имя в БД
                const { error: updateError } = await supabase
                    .from('high_scores')
                    .update({
                        player_name: playerName
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
                        player_name: playerName,
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

// Проверить, попал ли счет в топ N
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
