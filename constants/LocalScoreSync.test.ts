import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncLocalHighScores } from './LocalScoreSync';
import { getOwnedHighScores } from './Storage';
import { supabase } from './Supabase';
import { submitGlobalHighScoreOrQueue } from './OfflineSync';

jest.mock('./Storage', () => ({ getOwnedHighScores: jest.fn() }));
jest.mock('./Supabase', () => ({ supabase: { auth: { getSession: jest.fn() } } }));
jest.mock('./OfflineSync', () => ({ submitGlobalHighScoreOrQueue: jest.fn() }));
jest.mock('./SeasonScores', () => ({
    getSeasonBoard: (mode: string) => (mode === 'classic' || mode === 'chaos' ? mode : null),
    getSeasonKey: () => '2026-11',
    isSeasonOpenForSubmission: (achievedAt: number) => achievedAt >= 1000,
    submitSeasonScoreOrQueue: jest.fn(async () => 'synced'),
}));
jest.mock('@react-native-async-storage/async-storage', () => {
    const values = new Map();
    return { __esModule: true, default: {
        getItem: jest.fn(async (key: string) => values.get(key) ?? null),
        setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
        clear: jest.fn(async () => values.clear()),
    } };
});

beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    await AsyncStorage.setItem('PLAYER_NAME', 'pod_sallyamu');
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: { user: { id: 'account-a' } } } });
    (getOwnedHighScores as jest.Mock).mockImplementation(async (mode) => mode === 'classic' ? [{ score: 450 }] : []);
    (submitGlobalHighScoreOrQueue as jest.Mock).mockResolvedValue('synced');
});

it('uploads an old local best without requiring a pending queue or a new game', async () => {
    await syncLocalHighScores();
    expect(submitGlobalHighScoreOrQueue).toHaveBeenCalledWith('pod_sallyamu', 450, 'classic');
    await syncLocalHighScores();
    expect(submitGlobalHighScoreOrQueue).toHaveBeenCalledTimes(1);
});

it('retries after failure and after a higher local score', async () => {
    (submitGlobalHighScoreOrQueue as jest.Mock).mockResolvedValueOnce('queued');
    await syncLocalHighScores();
    await syncLocalHighScores();
    expect(submitGlobalHighScoreOrQueue).toHaveBeenCalledTimes(2);
    (getOwnedHighScores as jest.Mock).mockImplementation(async (mode) => mode === 'classic' ? [{ score: 600 }] : []);
    await syncLocalHighScores();
    expect(submitGlobalHighScoreOrQueue).toHaveBeenLastCalledWith('pod_sallyamu', 600, 'classic');
});

it('preserves a guest record until Discord supplies a session', async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValueOnce({ data: { session: null } });
    await syncLocalHighScores();
    expect(submitGlobalHighScoreOrQueue).not.toHaveBeenCalled();
    await syncLocalHighScores();
    expect(submitGlobalHighScoreOrQueue).toHaveBeenCalledTimes(1);
});


it('sends a guest record of the running season to the season board once', async () => {
    const { submitSeasonScoreOrQueue } = jest.requireMock('./SeasonScores');
    (getOwnedHighScores as jest.Mock).mockImplementation(async (mode) => mode === 'chaos' ? [{ score: 29745, date: 5000 }, { score: 100, date: 2000 }] : []);
    await syncLocalHighScores();
    await syncLocalHighScores();
    expect(submitSeasonScoreOrQueue).toHaveBeenCalledTimes(1);
    expect(submitSeasonScoreOrQueue).toHaveBeenCalledWith('chaos', 29745, 'account-a', 5000);
});

it('leaves records of past seasons off the season board', async () => {
    const { submitSeasonScoreOrQueue } = jest.requireMock('./SeasonScores');
    (getOwnedHighScores as jest.Mock).mockImplementation(async (mode) => mode === 'chaos' ? [{ score: 29745, date: 10 }] : []);
    await syncLocalHighScores();
    expect(submitSeasonScoreOrQueue).not.toHaveBeenCalled();
});
