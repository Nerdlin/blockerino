import { GameModeType, MenuStateType } from '@/hooks/useAppState';
import {
  DISCORD_PRESENCE_ASSETS,
  attachDiscordPresence,
  presencePointsText,
  presenceStreakText,
  scoreMilestone,
  setDiscordPresenceLocale,
  shouldUpdateEnd,
  buildPresenceContent,
  getPresenceScreen,
  resetDiscordPresenceForTests,
  toActivityPayload,
  updateDiscordPresence,
} from './DiscordPresence';

const noAssets = { logo: '', classic: '', chaos: '', versus: '', daily: '', speed: '', moveLimit: '', rescue: '', comboTrial: '' };
const assets = { ...noAssets, logo: 'logo', classic: 'classic', chaos: 'chaos', versus: 'versus' };

describe('Discord presence content', () => {
  it('describes the mode and activity', () => {
    expect(buildPresenceContent({ screen: 'singleplayer', mode: GameModeType.Chaos }, noAssets))
      .toMatchObject({ details: 'Chaos 10x10', state: 'In game' });
    expect(buildPresenceContent({ screen: 'singleplayer', mode: GameModeType.Classic }, noAssets).details).toBe('Classic 8x8');
    expect(buildPresenceContent({ screen: 'versus_lobby' }, noAssets).state).toBe('Searching for an opponent');
    expect(buildPresenceContent({ screen: 'versus_game', mode: GameModeType.Classic }, noAssets).details).toBe('Versus - Classic 8x8');
    expect(buildPresenceContent({ screen: 'menu' }, noAssets).state).toBe('In menu');
  });

  it('is text-only when no art assets are configured', () => {
    const payload = toActivityPayload(buildPresenceContent({ screen: 'singleplayer', mode: GameModeType.Classic }, noAssets), 1);
    expect(payload).not.toHaveProperty('assets');
    expect(payload.timestamps).toEqual({ start: 1 });
  });

  it('uses mode art as large image and logo as small image', () => {
    const payload = toActivityPayload(buildPresenceContent({ screen: 'singleplayer', mode: GameModeType.Chaos }, assets), 1);
    expect(payload.assets).toMatchObject({ large_image: 'chaos', small_image: 'logo' });
  });

  it('falls back to the logo when a mode has no art', () => {
    const payload: any = toActivityPayload(buildPresenceContent({ screen: 'singleplayer', mode: GameModeType.TimeAttack }, assets), 1);
    expect(payload.assets).toEqual({ large_image: 'logo', large_text: 'Speed Game' });
  });

  it('maps app state to a presence screen', () => {
    expect(getPresenceScreen(MenuStateType.MENU, false, false)).toBe('menu');
    expect(getPresenceScreen(GameModeType.Classic, true, false)).toBe('singleplayer');
    expect(getPresenceScreen(MenuStateType.MULTIPLAYER, false, false)).toBe('versus_lobby');
    expect(getPresenceScreen(MenuStateType.MULTIPLAYER_GAME, false, true)).toBe('versus_game');
  });
});

describe('Discord presence live line, party, countdown and language', () => {
  it('shows the score in the live line and keeps the plain text before the first points', () => {
    expect(buildPresenceContent({ screen: 'singleplayer', mode: GameModeType.Classic, score: 1240 }, noAssets))
      .toMatchObject({ details: 'Classic 8x8', state: '1,240 points' });
    expect(buildPresenceContent({ screen: 'singleplayer', mode: GameModeType.Classic, score: 0 }, noAssets).state).toBe('In game');
  });

  it('speaks Russian when asked to, with the right plural of the streak', () => {
    expect(buildPresenceContent({ screen: 'singleplayer', mode: GameModeType.Classic, score: 1240 }, noAssets, 'ru'))
      .toMatchObject({ details: 'Классика 8x8', state: '1 240 очков' });
    expect(buildPresenceContent({ screen: 'menu', streakDays: 5 }, noAssets, 'ru').state).toBe('В меню · серия 5 дней');
    expect(buildPresenceContent({ screen: 'menu', streakDays: 21 }, noAssets, 'ru').state).toBe('В меню · серия 21 день');
    expect(buildPresenceContent({ screen: 'menu', streakDays: 5 }, noAssets, 'en').state).toBe('In menu · 5-day streak');
    expect(buildPresenceContent({ screen: 'menu', streakDays: 1 }, noAssets).state).toBe('In menu');
    expect(presencePointsText(900, 'ru')).toBe('900 очков');
    expect(presenceStreakText(2, 'ru')).toBe('серия 2 дня');
  });

  it('gives the lobby and the duel a party ("1 of 2", "2 of 2")', () => {
    expect(buildPresenceContent({ screen: 'versus_lobby' }, noAssets, 'en', 'p1').party).toEqual({ id: 'p1', size: [1, 2] });
    expect(buildPresenceContent({ screen: 'versus_game', mode: GameModeType.Classic }, noAssets, 'en', 'p1').party).toEqual({ id: 'p1', size: [2, 2] });
    expect(buildPresenceContent({ screen: 'menu' }, noAssets).party).toBeUndefined();
    const payload: any = toActivityPayload(buildPresenceContent({ screen: 'versus_lobby' }, noAssets, 'en', 'p1'), 1);
    expect(payload.party).toEqual({ id: 'p1', size: [1, 2] });
  });

  it('counts down in the Speed Game only, and never sends buttons', () => {
    const speed = buildPresenceContent({ screen: 'singleplayer', mode: GameModeType.TimeAttack, endsAt: 99_000 }, noAssets);
    expect(toActivityPayload(speed, 1).timestamps).toEqual({ start: 1, end: 99_000 });
    const classic = buildPresenceContent({ screen: 'singleplayer', mode: GameModeType.Classic, endsAt: 99_000 }, noAssets);
    expect(toActivityPayload(classic, 1).timestamps).toEqual({ start: 1 });
    expect(toActivityPayload(speed, 1)).not.toHaveProperty('buttons');
  });

  it('has a picture key for every mode and the duel, all lowercase', () => {
    const keys = Object.values(DISCORD_PRESENCE_ASSETS);
    expect(keys.every((key) => key !== '' && key === key.toLowerCase())).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('pushes the score only at milestones', () => {
    expect([0, 120, 299, 300, 999, 1000, 2499, 2500, 10000, 19999, 20000, 34567].map(scoreMilestone))
      .toEqual([0, 0, 0, 300, 300, 1000, 1000, 2500, 10000, 10000, 20000, 30000]);
    expect(scoreMilestone(Number.NaN)).toBe(0);
  });

  it('corrects the countdown only when it drifted', () => {
    expect(shouldUpdateEnd(undefined, 100)).toBe(true);
    expect(shouldUpdateEnd(100_000, 103_000)).toBe(false);
    expect(shouldUpdateEnd(100_000, 110_000)).toBe(true);
  });
});

describe('Discord presence controller', () => {
  beforeEach(() => { jest.useFakeTimers(); resetDiscordPresenceForTests(); });
  afterEach(() => { jest.useRealTimers(); });

  it('does nothing without an attached SDK', () => {
    updateDiscordPresence({ screen: 'menu' });
    expect(() => jest.runAllTimers()).not.toThrow();
  });

  it('sends the latest context once attached and dedupes repeats', () => {
    const setActivity = jest.fn().mockResolvedValue({});
    updateDiscordPresence({ screen: 'singleplayer', mode: GameModeType.Classic });
    attachDiscordPresence({ commands: { setActivity } });
    jest.runAllTimers();
    expect(setActivity).toHaveBeenCalledTimes(1);
    expect(setActivity.mock.calls[0][0].activity).toMatchObject({ details: 'Classic 8x8', state: 'In game', type: 0 });

    updateDiscordPresence({ screen: 'singleplayer', mode: GameModeType.Classic });
    jest.runAllTimers();
    expect(setActivity).toHaveBeenCalledTimes(1);

    updateDiscordPresence({ screen: 'menu' });
    jest.runAllTimers();
    expect(setActivity).toHaveBeenCalledTimes(2);
  });

  it('keeps the start time while the mode stays, and spaces updates out', () => {
    const setActivity = jest.fn().mockResolvedValue({});
    attachDiscordPresence({ commands: { setActivity } });
    updateDiscordPresence({ screen: 'singleplayer', mode: GameModeType.Classic });
    jest.runAllTimers();
    updateDiscordPresence({ screen: 'singleplayer', mode: GameModeType.Classic, score: 1000 });
    jest.advanceTimersByTime(1000);
    expect(setActivity).toHaveBeenCalledTimes(1); // too soon after the first update
    jest.runAllTimers();
    expect(setActivity).toHaveBeenCalledTimes(2);
    const [first, second] = setActivity.mock.calls.map((call) => call[0].activity);
    expect(second.state).toBe('1,000 points');
    expect(second.timestamps.start).toBe(first.timestamps.start);
  });

  it('keeps the score when the screen hook pushes the same mode again', () => {
    const setActivity = jest.fn().mockResolvedValue({});
    attachDiscordPresence({ commands: { setActivity } });
    updateDiscordPresence({ screen: 'singleplayer', mode: GameModeType.Classic, score: 1000 });
    updateDiscordPresence({ screen: 'singleplayer', mode: GameModeType.Classic, streakDays: 3 });
    jest.runAllTimers();
    expect(setActivity.mock.calls[0][0].activity.state).toBe('1,000 points');
  });

  it('rewrites presence in the language Discord reports', () => {
    const setActivity = jest.fn().mockResolvedValue({});
    attachDiscordPresence({ commands: { setActivity } });
    updateDiscordPresence({ screen: 'menu' });
    jest.runAllTimers();
    setDiscordPresenceLocale('ru');
    jest.runAllTimers();
    expect(setActivity.mock.calls.map((call) => call[0].activity.state)).toEqual(['In menu', 'В меню']);
  });

  it('swallows setActivity failures', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const setActivity = jest.fn().mockRejectedValue(new Error('no scope'));
    attachDiscordPresence({ commands: { setActivity } });
    jest.runAllTimers();
    await Promise.resolve();
    await Promise.resolve();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
