import AsyncStorage from '@react-native-async-storage/async-storage';
import { getHighScores } from './Storage';
import { LEADERBOARD_GAME_MODES } from './GameModes';
import { supabase } from './Supabase';
import { submitGlobalHighScoreOrQueue } from './OfflineSync';

let running: Promise<void> | null = null;

// Recover records saved before a nickname/login existed or before a request was queued.
export function syncLocalHighScores(): Promise<void> {
    if (running) return running;
    running = (async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        const name = (await AsyncStorage.getItem('PLAYER_NAME'))?.trim();
        if (!name) return;
        for (const mode of LEADERBOARD_GAME_MODES) {
            const best = (await getHighScores(mode, true, true, 1))[0]?.score;
            if (!best || !Number.isFinite(best)) continue;
            const key = `SYNCED_LOCAL_BEST:${session.user.id}:${name.toLowerCase()}:${mode}`;
            const uploaded = Number(await AsyncStorage.getItem(key)) || 0;
            if (uploaded >= best) continue;
            const result = await submitGlobalHighScoreOrQueue(name, best, mode);
            if (result === 'synced') await AsyncStorage.setItem(key, String(best));
        }
    })().finally(() => { running = null; });
    return running;
}
