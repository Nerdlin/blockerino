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
            .limit(limit);

        if (error) {
            console.error('Error fetching global high scores:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('Error fetching global high scores:', error);
        return [];
    }
}

// Добавить новый рекорд в глобальную таблицу
export async function submitGlobalHighScore(
    playerName: string,
    score: number,
    gameMode: string
): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('high_scores')
            .insert([
                {
                    player_name: playerName,
                    score: score,
                    game_mode: gameMode
                }
            ]);

        if (error) {
            console.error('Error submitting high score:', error);
            return false;
        }

        return true;
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
