// Mock DiscordSDK for native platforms (iOS/Android)
// The actual @discord/embedded-app-sdk fails to build on native because it uses a reserved export name 'Commands'.
// Since Discord Activities only run on the web, this mock prevents build errors on mobile.
export class DiscordSDK {
  commands = {
    authorize: async (_options: Parameters<import('@discord/embedded-app-sdk').DiscordSDK['commands']['authorize']>[0]) => ({ code: '' }),
    setActivity: async (_options: unknown) => ({}),
    getInstanceConnectedParticipants: async (): Promise<{ participants: unknown[] }> => ({ participants: [] }),
    userSettingsGetLocale: async (): Promise<{ locale: string }> => ({ locale: 'en-US' }),
    openInviteDialog: async (): Promise<unknown> => null,
    initiateImageUpload: async (): Promise<{ image_url: string }> => ({ image_url: '' }),
    openShareMomentDialog: async (_options: { mediaUrl: string }): Promise<unknown> => null,
    openExternalLink: async (_options: { url: string }) => ({ opened: false }),
    authenticate: async (_options: Parameters<import('@discord/embedded-app-sdk').DiscordSDK['commands']['authenticate']>[0]): Promise<{ user: { id?: string; global_name?: string | null; username: string } | null }> => ({ user: null }),
  };
  guildId: string | null = null;
  platform = 'unknown';
  subscribe = async (_event: string, _listener: (data: { participants: unknown[] }) => void): Promise<unknown> => ({});
  constructor(clientId: string) {}
  async ready() {}
}
