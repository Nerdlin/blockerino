import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncLocalHighScores } from './LocalScoreSync';
import { getHighScores } from './Storage';
import { supabase } from './Supabase';
import { submitGlobalHighScoreOrQueue } from './OfflineSync';

jest.mock('./Storage', () => ({ getHighScores: jest.fn() }));
jest.mock('./Supabase', () => ({ supabase: { auth: { getSession: jest.fn() } } }));
jest.mock('./OfflineSync', () => ({ submitGlobalHighScoreOrQueue: jest.fn() }));
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
    (getHighScores as jest.Mock).mockImplementation(async (mode) => mode === 'classic' ? [{ score: 450 }] : []);
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
    (getHighScores as jest.Mock).mockImplementation(async (mode) => mode === 'classic' ? [{ score: 600 }] : []);
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
