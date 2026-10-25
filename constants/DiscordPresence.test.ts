import { GameModeType, MenuStateType } from '@/hooks/useAppState';
import {
  attachDiscordPresence,
  buildPresenceContent,
  getPresenceScreen,
  resetDiscordPresenceForTests,
  toActivityPayload,
  updateDiscordPresence,
} from './DiscordPresence';

const noAssets = { logo: '', classic: '', chaos: '', versus: '', daily: '', speed: '', moveLimit: '' };
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
