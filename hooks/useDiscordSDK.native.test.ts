jest.mock('@/constants/Supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true, default: {},
}));
jest.mock('./discordSdk', () => ({ DiscordSDK: jest.fn() }));

describe('Discord hook on native app startup', () => {
  it('imports with a configured client ID and native window without location', () => {
    const previousClientId = process.env.EXPO_PUBLIC_DISCORD_CLIENT_ID;
    const previousLocation = Object.getOwnPropertyDescriptor(window, 'location');
    process.env.EXPO_PUBLIC_DISCORD_CLIENT_ID = 'test-client';
    Object.defineProperty(window, 'location', { configurable: true, value: undefined });
    try {
      jest.isolateModules(() => {
        expect(() => require('./useDiscordSDK')).not.toThrow();
        expect(require('./discordSdk').DiscordSDK).not.toHaveBeenCalled();
      });
    } finally {
      if (previousClientId === undefined) delete process.env.EXPO_PUBLIC_DISCORD_CLIENT_ID;
      else process.env.EXPO_PUBLIC_DISCORD_CLIENT_ID = previousClientId;
      if (previousLocation) Object.defineProperty(window, 'location', previousLocation);
      else delete (window as any).location;
    }
  });
});
