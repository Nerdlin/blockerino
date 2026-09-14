// Mock DiscordSDK for native platforms (iOS/Android)
// The actual @discord/embedded-app-sdk fails to build on native because it uses a reserved export name 'Commands'.
// Since Discord Activities only run on the web, this mock prevents build errors on mobile.
export class DiscordSDK {
  commands = {
    authorize: async (_options: Parameters<import('@discord/embedded-app-sdk').DiscordSDK['commands']['authorize']>[0]) => ({ code: '' }),
    authenticate: async (_options: Parameters<import('@discord/embedded-app-sdk').DiscordSDK['commands']['authenticate']>[0]): Promise<{ user: { global_name?: string | null; username: string } | null }> => ({ user: null }),
  };
  constructor(clientId: string) {}
  async ready() {}
}
