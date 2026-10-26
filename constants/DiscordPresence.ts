import { GameModeType, MenuStateType } from '@/hooks/useAppState';

// Art asset keys uploaded in Discord Developer Portal -> Rich Presence -> Art Assets.
// Leave a key empty ('') until the asset exists: presence then falls back to text only.
export const DISCORD_PRESENCE_ASSETS = {
  logo: 'icon',
  classic: '',
  chaos: '',
  versus: '',
  daily: '',
  speed: '',
  moveLimit: '',
  rescue: '',
  comboTrial: '',
};

export type DiscordPresenceScreen = 'menu' | 'singleplayer' | 'versus_lobby' | 'versus_game';

export interface DiscordPresenceContext {
  screen: DiscordPresenceScreen;
  mode?: GameModeType;
}

export interface DiscordPresenceContent {
  details: string;
  state: string;
  largeImage?: string;
  largeText?: string;
  smallImage?: string;
  smallText?: string;
}

const MODE_LABELS: Record<GameModeType, string> = {
  [GameModeType.Classic]: 'Classic 8x8',
  [GameModeType.Chaos]: 'Chaos 10x10',
  [GameModeType.DailyPuzzle]: 'Daily Puzzle',
  [GameModeType.TimeAttack]: 'Speed Game',
  [GameModeType.MoveLimit]: 'Move Limit',
  [GameModeType.Rescue]: 'Rescue',
  [GameModeType.ComboTrial]: 'Combo Trial',
};

const MODE_ASSET_KEYS: Record<GameModeType, keyof typeof DISCORD_PRESENCE_ASSETS> = {
  [GameModeType.Classic]: 'classic',
  [GameModeType.Chaos]: 'chaos',
  [GameModeType.DailyPuzzle]: 'daily',
  [GameModeType.TimeAttack]: 'speed',
  [GameModeType.MoveLimit]: 'moveLimit',
  [GameModeType.Rescue]: 'rescue',
  [GameModeType.ComboTrial]: 'comboTrial',
};

export function getPresenceModeLabel(mode: GameModeType | undefined): string {
  return (mode && MODE_LABELS[mode]) || 'Classic 8x8';
}

export function getPresenceScreen(
  currentState: MenuStateType | GameModeType | undefined,
  hasGameMode: boolean,
  multiplayerGameVisible: boolean,
): DiscordPresenceScreen {
  if (multiplayerGameVisible) return 'versus_game';
  if (hasGameMode) return 'singleplayer';
  if (currentState === MenuStateType.MULTIPLAYER) return 'versus_lobby';
  return 'menu';
}

// Returns undefined for a missing/empty key so unset assets are simply omitted.
function asset(key: keyof typeof DISCORD_PRESENCE_ASSETS, assets = DISCORD_PRESENCE_ASSETS): string | undefined {
  return assets[key] || undefined;
}

export function buildPresenceContent(
  context: DiscordPresenceContext,
  assets: typeof DISCORD_PRESENCE_ASSETS = DISCORD_PRESENCE_ASSETS,
): DiscordPresenceContent {
  const logo = asset('logo', assets);
  switch (context.screen) {
    case 'singleplayer': {
      const mode = context.mode ?? GameModeType.Classic;
      const modeAsset = assets[MODE_ASSET_KEYS[mode]] || undefined;
      return {
        details: getPresenceModeLabel(mode),
        state: 'In game',
        largeImage: modeAsset ?? logo,
        largeText: getPresenceModeLabel(mode),
        smallImage: modeAsset ? logo : undefined,
        smallText: modeAsset && logo ? 'Blockerino' : undefined,
      };
    }
    case 'versus_game':
      return {
        details: `Versus - ${getPresenceModeLabel(context.mode)}`,
        state: 'In a match',
        largeImage: asset('versus', assets) ?? logo,
        largeText: 'Versus',
        smallImage: asset('versus', assets) ? logo : undefined,
        smallText: asset('versus', assets) && logo ? 'Blockerino' : undefined,
      };
    case 'versus_lobby':
      return {
        details: 'Versus',
        state: 'Searching for an opponent',
        largeImage: asset('versus', assets) ?? logo,
        largeText: 'Versus',
        smallImage: asset('versus', assets) ? logo : undefined,
        smallText: asset('versus', assets) && logo ? 'Blockerino' : undefined,
      };
    default:
      return {
        details: 'Blockerino',
        state: 'In menu',
        largeImage: logo,
        largeText: logo ? 'Blockerino' : undefined,
      };
  }
}

// Shape accepted by sdk.commands.setActivity({ activity }).
export function toActivityPayload(content: DiscordPresenceContent, startTimestamp: number) {
  const assets: Record<string, string> = {};
  if (content.largeImage) {
    assets.large_image = content.largeImage;
    if (content.largeText) assets.large_text = content.largeText;
  }
  if (content.smallImage) {
    assets.small_image = content.smallImage;
    if (content.smallText) assets.small_text = content.smallText;
  }
  return {
    type: 0,
    details: content.details,
    state: content.state,
    timestamps: { start: startTimestamp },
    ...(Object.keys(assets).length > 0 ? { assets } : {}),
  };
}

export interface PresenceSdk {
  commands: { setActivity: (args: { activity: any }) => Promise<unknown> };
}

const SEND_DELAY_MS = 800;

// Module-level controller: the hook only pushes context, the SDK is attached
// once the Activity is authorised (rpc.activities.write). Without an attached
// SDK (web, APK, failed login) every call is a no-op.
let sdk: PresenceSdk | null = null;
let pending: DiscordPresenceContext | null = null;
let lastKey: string | null = null;
let startedAt = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

function keyOf(content: DiscordPresenceContent): string {
  return `${content.details}|${content.state}`;
}

function flush(): void {
  timer = undefined;
  if (!sdk || !pending) return;
  const content = buildPresenceContent(pending);
  const key = keyOf(content);
  if (key === lastKey) return;
  lastKey = key;
  startedAt = Date.now();
  sdk.commands.setActivity({ activity: toActivityPayload(content, startedAt) }).catch((error) => {
    lastKey = null;
    console.warn('Discord presence update failed:', error);
  });
}

function schedule(): void {
  if (timer !== undefined || !sdk) return;
  timer = setTimeout(flush, SEND_DELAY_MS);
}

export function attachDiscordPresence(nextSdk: PresenceSdk): void {
  sdk = nextSdk;
  lastKey = null;
  if (!pending) pending = { screen: 'menu' };
  schedule();
}

export function updateDiscordPresence(context: DiscordPresenceContext): void {
  pending = context;
  schedule();
}

export function resetDiscordPresenceForTests(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  sdk = null;
  pending = null;
  lastKey = null;
  startedAt = 0;
}
