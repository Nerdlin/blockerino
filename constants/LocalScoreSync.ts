import AsyncStorage from '@react-native-async-storage/async-storage';
import { getOwnedHighScores } from './Storage';
import { LEADERBOARD_GAME_MODES } from './GameModes';
import { supabase } from './Supabase';
import { submitGlobalHighScoreOrQueue } from './OfflineSync';
import { getSeasonBoard, getSeasonKey, isSeasonOpenForSubmission, submitSeasonScoreOrQueue } from './SeasonScores';

let running: Promise<void> | null = null;

// Recover records saved before a nickname/login existed or before a request was queued. A guest's records are
// claimed by the first account that signs in on the device (getOwnedHighScores) and go to its all-time and,
// when they were set in the running season, its season leaderboard.
export function syncLocalHighScores(): Promise<void> {
    if (running) return running;
    running = (async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        const name = (await AsyncStorage.getItem('PLAYER_NAME'))?.trim();
        if (!name) return;
        for (const mode of LEADERBOARD_GAME_MODES) {
            const best = (await getOwnedHighScores(mode, session.user.id))[0]?.score;
            if (!best || !Number.isFinite(best)) continue;
            const key = `SYNCED_LOCAL_BEST:${session.user.id}:${name.toLowerCase()}:${mode}`;
            const uploaded = Number(await AsyncStorage.getItem(key)) || 0;
            if (uploaded >= best) continue;
            const result = await submitGlobalHighScoreOrQueue(name, best, mode);
            if (result === 'synced') await AsyncStorage.setItem(key, String(best));
        }
        for (const mode of LEADERBOARD_GAME_MODES) {
            if (!getSeasonBoard(mode)) continue;
            const seasonBest = (await getOwnedHighScores(mode, session.user.id))
                .find((score) => Number.isFinite(score.score) && score.score > 0 && Number.isFinite(score.date) && isSeasonOpenForSubmission(score.date));
            if (!seasonBest) continue;
            const key = `SYNCED_SEASON_BEST:${session.user.id}:${getSeasonKey(new Date(seasonBest.date))}:${mode}`;
            const uploaded = Number(await AsyncStorage.getItem(key)) || 0;
            if (uploaded >= seasonBest.score) continue;
            const result = await submitSeasonScoreOrQueue(mode, seasonBest.score, session.user.id, seasonBest.date);
            if (result !== 'skipped') await AsyncStorage.setItem(key, String(seasonBest.score));
        }
    })().finally(() => { running = null; });
    return running;
}
