import AsyncStorage from '@react-native-async-storage/async-storage';
import { getOwnedHighScores, updateHighScore } from './Storage';
import { GameModeType } from '@/hooks/useAppState';

jest.mock('./Supabase', () => ({ supabase: { auth: { getSession: jest.fn() } } }));
jest.mock('@react-native-async-storage/async-storage', () => {
    const data = new Map<string, string>();
    return { __esModule: true, default: {
        getItem: jest.fn(async (key: string) => data.get(key) ?? null),
        setItem: jest.fn(async (key: string, value: string) => { data.set(key, value); }),
        clear: jest.fn(async () => data.clear()),
    } };
});

it('claims a legacy record once and preserves ownership through score updates', async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('HIGH_SCORES', JSON.stringify(['old']));
    await AsyncStorage.setItem('old', JSON.stringify({ score: 300, date: 1, type: GameModeType.Classic }));
    expect(await getOwnedHighScores(GameModeType.Classic, 'alice')).toHaveLength(1);
    expect(await getOwnedHighScores(GameModeType.Classic, 'bob')).toHaveLength(0);
    await updateHighScore('old', { score: 500, date: 2, type: GameModeType.Classic }, { immediate: true });
    expect((await getOwnedHighScores(GameModeType.Classic, 'alice'))[0].score).toBe(500);
    expect(await getOwnedHighScores(GameModeType.Classic, 'bob')).toHaveLength(0);
});
