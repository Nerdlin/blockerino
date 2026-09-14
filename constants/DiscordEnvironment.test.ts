import { isDiscordActivityLocation, withDiscordTimeout } from './DiscordEnvironment';

describe('Discord Activity startup', () => {
  it('recognizes the proxy and local Activity launch parameters', () => {
    expect(isDiscordActivityLocation('123.discordsays.com', '')).toBe(true);
    expect(isDiscordActivityLocation('localhost', '?frame_id=abc&instance_id=def')).toBe(true);
    expect(isDiscordActivityLocation('blockerino.aionerdlin.me', '')).toBe(false);
    expect(isDiscordActivityLocation('discordsays.com.example.org', '')).toBe(false);
    expect(isDiscordActivityLocation('localhost', '?frame_id=abc')).toBe(false);
  });

  it('does not leave a stalled SDK handshake waiting forever', async () => {
    jest.useFakeTimers();
    try {
      const result = withDiscordTimeout(new Promise(() => {}), 100);
      const assertion = expect(result).rejects.toThrow('timed out');
      jest.advanceTimersByTime(100);
      await assertion;
      expect(jest.getTimerCount()).toBe(0);
    } finally { jest.useRealTimers(); }
  });

  it('clears the watchdog after a successful handshake', async () => {
    jest.useFakeTimers();
    try {
      await expect(withDiscordTimeout(Promise.resolve('ready'))).resolves.toBe('ready');
      expect(jest.getTimerCount()).toBe(0);
    } finally { jest.useRealTimers(); }
  });
});
