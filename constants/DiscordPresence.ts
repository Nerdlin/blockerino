import { GameModeType, MenuStateType } from '@/hooks/useAppState';
import { formatNumber, ruPlural, type PresenceLang } from './DiscordLocale';

// Art asset keys uploaded in Discord Developer Portal -> Rich Presence -> Art Assets.
// The pictures are in docs/discord/assets/<key>.png (see docs/discord/README.md). An empty key means "no picture":
// presence then falls back to text only. Discord lowercases keys, so they are lowercase here.
export const DISCORD_PRESENCE_ASSETS = {
  logo: 'icon',
  classic: 'classic',
  chaos: 'chaos',
  versus: 'duel',
  daily: 'daily',
  speed: 'speed',
  moveLimit: 'move_limit',
  rescue: 'rescue',
  comboTrial: 'combo',
};

export type DiscordPresenceScreen = 'menu' | 'singleplayer' | 'versus_lobby' | 'versus_game';

export interface DiscordPresenceContext {
  screen: DiscordPresenceScreen;
  mode?: GameModeType;
  /** Score for the live line; only milestones are pushed (see scoreMilestone), Discord limits how often presence may change. */
  score?: number;
  /** Day streak shown in the menu. */
  streakDays?: number;
  /** When the Speed Game timer runs out (ms since epoch): Discord shows a countdown. */
  endsAt?: number;
}

export interface DiscordPresenceParty {
  id: string;
  /** [players now, players at most] */
  size: [number, number];
}

export interface DiscordPresenceContent {
  details: string;
  state: string;
  largeImage?: string;
  largeText?: string;
  smallImage?: string;
  smallText?: string;
  party?: DiscordPresenceParty;
  endsAt?: number;
}

type TextKey =
  | 'inGame' | 'inMenu' | 'inMatch' | 'searching' | 'versus' | 'points' | 'streak'
  | 'classic' | 'chaos' | 'daily' | 'speed' | 'moveLimit' | 'rescue' | 'comboTrial' | 'levels';

const TEXTS: Record<PresenceLang, Record<TextKey, string>> = {
  en: {
    inGame: 'In game', inMenu: 'In menu', inMatch: 'In a match', searching: 'Searching for an opponent', versus: 'Versus',
    points: 'points', streak: 'day streak',
    classic: 'Classic 8x8', chaos: 'Chaos 10x10', daily: 'Daily Puzzle', speed: 'Speed Game', moveLimit: 'Move Limit',
    rescue: 'Rescue', comboTrial: 'Combo Trial', levels: 'Levels',
  },
  ru: {
    inGame: 'В игре', inMenu: 'В меню', inMatch: 'В матче', searching: 'Ищет соперника', versus: 'Дуэль',
    points: 'очков', streak: 'серия',
    classic: 'Классика 8x8', chaos: 'Хаос 10x10', daily: 'Ежедневная головоломка', speed: 'Скоростная игра', moveLimit: 'Лимит ходов',
    rescue: 'Спасение', comboTrial: 'Комбо-испытание', levels: 'Уровни',
  },
};

const MODE_TEXT_KEYS: Record<GameModeType, TextKey> = {
  [GameModeType.Classic]: 'classic',
  [GameModeType.Chaos]: 'chaos',
  [GameModeType.DailyPuzzle]: 'daily',
  [GameModeType.TimeAttack]: 'speed',
  [GameModeType.MoveLimit]: 'moveLimit',
  [GameModeType.Rescue]: 'rescue',
  [GameModeType.ComboTrial]: 'comboTrial',
  [GameModeType.Level]: 'levels',
};

const MODE_ASSET_KEYS: Record<GameModeType, keyof typeof DISCORD_PRESENCE_ASSETS> = {
  [GameModeType.Classic]: 'classic',
  [GameModeType.Chaos]: 'chaos',
  [GameModeType.DailyPuzzle]: 'daily',
  [GameModeType.TimeAttack]: 'speed',
  [GameModeType.MoveLimit]: 'moveLimit',
  [GameModeType.Rescue]: 'rescue',
  [GameModeType.ComboTrial]: 'comboTrial',
  [GameModeType.Level]: 'daily',
};

export function getPresenceModeLabel(mode: GameModeType | undefined, lang: PresenceLang = 'en'): string {
  return TEXTS[lang][MODE_TEXT_KEYS[mode ?? GameModeType.Classic]] ?? TEXTS[lang].classic;
}

/** "1,240 points" / "1 240 очков" */
export function presencePointsText(score: number, lang: PresenceLang): string {
  return `${formatNumber(score, lang)} ${TEXTS[lang].points}`;
}

/** "5-day streak" / "серия 5 дней" */
export function presenceStreakText(days: number, lang: PresenceLang): string {
  if (lang === 'ru') return `${TEXTS.ru.streak} ${days} ${ruPlural(days, 'день', 'дня', 'дней')}`;
  return `${days}-${TEXTS.en.streak}`;
}

// Discord limits how often presence may change (about 5 updates per 20 seconds), and a line that flickers is annoying.
// So the score goes out only when it crosses a milestone.
const SCORE_STEPS = [300, 1000, 2500, 5000, 10000];

/** The milestone a score has reached: 0 below 300, then 300 / 1000 / 2500 / 5000 / 10000, then every 10000. */
export function scoreMilestone(score: number): number {
  if (!(score > 0)) return 0;
  if (score >= 20000) return Math.floor(score / 10000) * 10000;
  let reached = 0;
  for (const step of SCORE_STEPS) if (score >= step) reached = step;
  return reached;
}

const END_DRIFT_MS = 8000;

/** The Speed Game timer gains seconds for every line; the countdown is corrected only when it is off by a good margin. */
export function shouldUpdateEnd(sentEnd: number | undefined, nextEnd: number): boolean {
  return sentEnd === undefined || Math.abs(nextEnd - sentEnd) > END_DRIFT_MS;
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
  lang: PresenceLang = 'en',
  partyId = 'blockerino',
): DiscordPresenceContent {
  const text = TEXTS[lang];
  const logo = asset('logo', assets);
  switch (context.screen) {
    case 'singleplayer': {
      const mode = context.mode ?? GameModeType.Classic;
      const modeAsset = assets[MODE_ASSET_KEYS[mode]] || undefined;
      const label = getPresenceModeLabel(mode, lang);
      return {
        details: label,
        state: context.score && context.score > 0 ? presencePointsText(context.score, lang) : text.inGame,
        largeImage: modeAsset ?? logo,
        largeText: label,
        smallImage: modeAsset ? logo : undefined,
        smallText: modeAsset && logo ? 'Blockerino' : undefined,
        endsAt: mode === GameModeType.TimeAttack ? context.endsAt : undefined,
      };
    }
    case 'versus_game':
      return {
        details: `${text.versus} - ${getPresenceModeLabel(context.mode, lang)}`,
        state: text.inMatch,
        largeImage: asset('versus', assets) ?? logo,
        largeText: text.versus,
        smallImage: asset('versus', assets) ? logo : undefined,
        smallText: asset('versus', assets) && logo ? 'Blockerino' : undefined,
        party: { id: partyId, size: [2, 2] },
      };
    case 'versus_lobby':
      return {
        details: text.versus,
        state: text.searching,
        largeImage: asset('versus', assets) ?? logo,
        largeText: text.versus,
        smallImage: asset('versus', assets) ? logo : undefined,
        smallText: asset('versus', assets) && logo ? 'Blockerino' : undefined,
        party: { id: partyId, size: [1, 2] },
      };
    default:
      return {
        details: 'Blockerino',
        state: context.streakDays && context.streakDays >= 2
          ? `${text.inMenu} · ${presenceStreakText(context.streakDays, lang)}`
          : text.inMenu,
        largeImage: logo,
        largeText: logo ? 'Blockerino' : undefined,
      };
  }
}

// Shape accepted by sdk.commands.setActivity({ activity }). Buttons are not supported for Activities, so there are none.
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
    timestamps: content.endsAt ? { start: startTimestamp, end: content.endsAt } : { start: startTimestamp },
    ...(Object.keys(assets).length > 0 ? { assets } : {}),
    ...(content.party ? { party: { id: content.party.id, size: content.party.size } } : {}),
  };
}

export interface PresenceSdk {
  commands: { setActivity: (args: { activity: any }) => Promise<unknown> };
}

const SEND_DELAY_MS = 800;
const MIN_GAP_MS = 4500;

// Module-level controller: the hook only pushes context, the SDK is attached
// once the Activity is authorised (rpc.activities.write). Without an attached
// SDK (web, APK, failed login) every call is a no-op.
let sdk: PresenceSdk | null = null;
let pending: DiscordPresenceContext | null = null;
let lastKey: string | null = null;
let startedAt = 0;
let startedFor = '';
let lastSentAt = 0;
let lang: PresenceLang = 'en';
let partyId = `blockerino-${Math.random().toString(36).slice(2, 10)}`;
let timer: ReturnType<typeof setTimeout> | undefined;

function keyOf(content: DiscordPresenceContent): string {
  const party = content.party ? `${content.party.size[0]}/${content.party.size[1]}` : '';
  return `${content.details}|${content.state}|${party}|${content.endsAt ?? ''}|${content.largeImage ?? ''}`;
}

function flush(now: number = Date.now()): void {
  timer = undefined;
  if (!sdk || !pending) return;
  const content = buildPresenceContent(pending, DISCORD_PRESENCE_ASSETS, lang, partyId);
  const key = keyOf(content);
  if (key === lastKey) return;
  const wait = MIN_GAP_MS - (now - lastSentAt);
  if (lastSentAt > 0 && wait > 0) {
    timer = setTimeout(() => flush(), wait);
    return;
  }
  lastKey = key;
  lastSentAt = now;
  // "elapsed time" belongs to what the player is doing (a mode, the menu), not to every score change
  const startKey = `${pending.screen}|${pending.mode ?? ''}`;
  if (startKey !== startedFor || startedAt === 0) {
    startedFor = startKey;
    startedAt = now;
  }
  sdk.commands.setActivity({ activity: toActivityPayload(content, startedAt) }).catch((error) => {
    lastKey = null;
    console.warn('Discord presence update failed:', error);
  });
}

function schedule(): void {
  if (timer !== undefined || !sdk) return;
  timer = setTimeout(() => flush(), SEND_DELAY_MS);
}

export function attachDiscordPresence(nextSdk: PresenceSdk): void {
  sdk = nextSdk;
  lastKey = null;
  if (!pending) pending = { screen: 'menu' };
  schedule();
}

export function updateDiscordPresence(context: DiscordPresenceContext): void {
  // the screen hook does not know the live score or the countdown: keep them while the player stays in the same mode
  const same = !!pending && pending.screen === context.screen && pending.mode === context.mode;
  pending = {
    ...context,
    score: context.score ?? (same ? pending?.score : undefined),
    endsAt: context.endsAt ?? (same ? pending?.endsAt : undefined),
  };
  schedule();
}

/** The player's Discord language; presence is rewritten in it. */
export function setDiscordPresenceLocale(next: PresenceLang): void {
  if (next === lang) return;
  lang = next;
  lastKey = null;
  schedule();
}

export function resetDiscordPresenceForTests(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  sdk = null;
  pending = null;
  lastKey = null;
  startedAt = 0;
  startedFor = '';
  lastSentAt = 0;
  lang = 'en';
  partyId = 'blockerino-test';
}
