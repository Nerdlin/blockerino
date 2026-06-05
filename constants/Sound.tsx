import { createAudioPlayer, AudioPlayer, setAudioModeAsync } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { atom, useAtom, useAtomValue } from 'jotai';
import { shopStateAtom } from './Shop';
import { useEffect } from 'react';
import { Platform } from 'react-native';

// Ключи для сохранения настроек
const MUSIC_VOLUME_KEY = 'MUSIC_VOLUME';
const SFX_VOLUME_KEY = 'SFX_VOLUME';
const MUSIC_ENABLED_KEY = 'MUSIC_ENABLED';
const SFX_ENABLED_KEY = 'SFX_ENABLED';
export const CUSTOM_MUSIC_URL_KEY = 'CUSTOM_MUSIC_URL';
export const CUSTOM_SFX_URL_KEY = 'CUSTOM_SFX_URL';

// Атомы для хранения состояния звука
export const musicVolumeAtom = atom(0.5);
export const sfxVolumeAtom = atom(0.7);
export const musicEnabledAtom = atom(true);
export const sfxEnabledAtom = atom(true);

export function getAudioModeOptions() {
  return {
    playsInSilentMode: true,
    shouldPlayInBackground: false,
  };
}

export function shouldPauseMusicForAppState(appState: string): boolean {
  return appState !== 'active';
}

// Словарь звуков
export type SoundType = 
  | 'placeBlock' 
  | 'breakLine' 
  | 'comboBreak' 
  | 'comboX2'
  | 'comboX3'
  | 'comboX4'
  | 'comboX5'
  | 'gameOver' 
  | 'menuClick' 
  | 'invalidPlacement'
  | 'buttonHover';

const MUSIC_TRACK_RESOURCES = {
  backgroundMusic: require('../assets/sounds/background-music.mp3'),
  musicLofi: require('../assets/sounds/generated/music-lofi.wav'),
  musicArcade: require('../assets/sounds/generated/music-arcade.wav'),
  musicCave: require('../assets/sounds/generated/music-cave.wav'),
  musicSpace: require('../assets/sounds/generated/music-space.wav'),
  musicRainPiano: require('../assets/sounds/generated/music-rain-piano.wav'),
  musicJazz: require('../assets/sounds/generated/music-jazz.wav'),
  musicSynthwave: require('../assets/sounds/generated/music-synthwave.wav'),
  musicBlues: require('../assets/sounds/generated/music-blues.wav'),
  musicDreamPop: require('../assets/sounds/generated/music-dream-pop.wav'),
  musicDrumBass: require('../assets/sounds/generated/music-drum-bass.wav'),
  musicChiptune: require('../assets/sounds/generated/music-chiptune.wav'),
  musicTechno: require('../assets/sounds/generated/music-techno.wav'),
  musicTrap: require('../assets/sounds/generated/music-trap.wav'),
  musicOrchestral: require('../assets/sounds/generated/music-orchestral.wav'),
  musicIndustrial: require('../assets/sounds/generated/music-industrial.wav'),
  musicAmbient: require('../assets/sounds/generated/music-ambient.wav'),
  musicChoir: require('../assets/sounds/generated/music-choir.wav'),
  musicPercussion: require('../assets/sounds/generated/music-percussion.wav'),
  musicNoir: require('../assets/sounds/generated/music-noir.wav'),
  musicReggae: require('../assets/sounds/generated/music-reggae.wav'),
  musicTropical: require('../assets/sounds/generated/music-tropical.wav'),
  musicFunk: require('../assets/sounds/generated/music-funk.wav'),
  musicGlitch: require('../assets/sounds/generated/music-glitch.wav'),
  musicMarch: require('../assets/sounds/generated/music-march.wav'),
  musicSalsa: require('../assets/sounds/generated/music-salsa.wav'),
  musicHardstyle: require('../assets/sounds/generated/music-hardstyle.wav'),
  musicMusicBox: require('../assets/sounds/generated/music-music-box.wav'),
  musicHarp: require('../assets/sounds/generated/music-harp.wav'),
  musicBreakbeat: require('../assets/sounds/generated/music-breakbeat.wav'),
  musicDub: require('../assets/sounds/generated/music-dub.wav'),
  musicGarage: require('../assets/sounds/generated/music-garage.wav'),
  musicMinimal: require('../assets/sounds/generated/music-minimal.wav'),
  musicWaltz: require('../assets/sounds/generated/music-waltz.wav'),
  musicFutureBass: require('../assets/sounds/generated/music-future-bass.wav'),
} as const;

const SFX_RESOURCES = {
  placeBlock: require('../assets/sounds/place-block.mp3'),
  breakLine: require('../assets/sounds/break-line.mp3'),
  comboBreak: require('../assets/sounds/combo-break.mp3'),
  comboX2: require('../assets/sounds/combo-x2.mp3'),
  comboX3: require('../assets/sounds/combo-x3.mp3'),
  comboX4: require('../assets/sounds/combo-x4.mp3'),
  comboX5: require('../assets/sounds/combo-x5.mp3'),
  gameOver: require('../assets/sounds/game-over.mp3'),
  menuClick: require('../assets/sounds/menu-click.mp3'),
  invalidPlacement: require('../assets/sounds/invalid-placement.mp3'),
  buttonHover: require('../assets/sounds/button-hover.mp3'),
  sfxWoodPlace: require('../assets/sounds/generated/sfx-wood-place.wav'),
  sfxWoodClear: require('../assets/sounds/generated/sfx-wood-clear.wav'),
  sfxWoodClick: require('../assets/sounds/generated/sfx-wood-click.wav'),
  sfxGlassPlace: require('../assets/sounds/generated/sfx-glass-place.wav'),
  sfxGlassClear: require('../assets/sounds/generated/sfx-glass-clear.wav'),
  sfxGlassClick: require('../assets/sounds/generated/sfx-glass-click.wav'),
  sfxRetroPlace: require('../assets/sounds/generated/sfx-retro-place.wav'),
  sfxRetroClear: require('../assets/sounds/generated/sfx-retro-clear.wav'),
  sfxRetroClick: require('../assets/sounds/generated/sfx-retro-click.wav'),
  sfxMetalPlace: require('../assets/sounds/generated/sfx-metal-place.wav'),
  sfxMetalClear: require('../assets/sounds/generated/sfx-metal-clear.wav'),
  sfxMetalClick: require('../assets/sounds/generated/sfx-metal-click.wav'),
  sfxPaperPlace: require('../assets/sounds/generated/sfx-paper-place.wav'),
  sfxPaperClear: require('../assets/sounds/generated/sfx-paper-clear.wav'),
  sfxPaperClick: require('../assets/sounds/generated/sfx-paper-click.wav'),
  sfxBubblePlace: require('../assets/sounds/generated/sfx-bubble-place.wav'),
  sfxBubbleClear: require('../assets/sounds/generated/sfx-bubble-clear.wav'),
  sfxBubbleClick: require('../assets/sounds/generated/sfx-bubble-click.wav'),
  sfxLaserPlace: require('../assets/sounds/generated/sfx-laser-place.wav'),
  sfxLaserClear: require('../assets/sounds/generated/sfx-laser-clear.wav'),
  sfxLaserClick: require('../assets/sounds/generated/sfx-laser-click.wav'),
  sfxStonePlace: require('../assets/sounds/generated/sfx-stone-place.wav'),
  sfxStoneClear: require('../assets/sounds/generated/sfx-stone-clear.wav'),
  sfxStoneClick: require('../assets/sounds/generated/sfx-stone-click.wav'),
  sfxWaterPlace: require('../assets/sounds/generated/sfx-water-place.wav'),
  sfxWaterClear: require('../assets/sounds/generated/sfx-water-clear.wav'),
  sfxWaterClick: require('../assets/sounds/generated/sfx-water-click.wav'),
  sfxElectricPlace: require('../assets/sounds/generated/sfx-electric-place.wav'),
  sfxElectricClear: require('../assets/sounds/generated/sfx-electric-clear.wav'),
  sfxElectricClick: require('../assets/sounds/generated/sfx-electric-click.wav'),
  sfxToyPlace: require('../assets/sounds/generated/sfx-toy-place.wav'),
  sfxToyClear: require('../assets/sounds/generated/sfx-toy-clear.wav'),
  sfxToyClick: require('../assets/sounds/generated/sfx-toy-click.wav'),
  sfxClayPlace: require('../assets/sounds/generated/sfx-clay-place.wav'),
  sfxClayClear: require('../assets/sounds/generated/sfx-clay-clear.wav'),
  sfxClayClick: require('../assets/sounds/generated/sfx-clay-click.wav'),
  sfxBellPlace: require('../assets/sounds/generated/sfx-bell-place.wav'),
  sfxBellClear: require('../assets/sounds/generated/sfx-bell-clear.wav'),
  sfxBellClick: require('../assets/sounds/generated/sfx-bell-click.wav'),
  sfxWhooshPlace: require('../assets/sounds/generated/sfx-whoosh-place.wav'),
  sfxWhooshClear: require('../assets/sounds/generated/sfx-whoosh-clear.wav'),
  sfxWhooshClick: require('../assets/sounds/generated/sfx-whoosh-click.wav'),
  sfxTypewriterPlace: require('../assets/sounds/generated/sfx-typewriter-place.wav'),
  sfxTypewriterClear: require('../assets/sounds/generated/sfx-typewriter-clear.wav'),
  sfxTypewriterClick: require('../assets/sounds/generated/sfx-typewriter-click.wav'),
  sfxSpringPlace: require('../assets/sounds/generated/sfx-spring-place.wav'),
  sfxSpringClear: require('../assets/sounds/generated/sfx-spring-clear.wav'),
  sfxSpringClick: require('../assets/sounds/generated/sfx-spring-click.wav'),
  sfxIcePlace: require('../assets/sounds/generated/sfx-ice-place.wav'),
  sfxIceClear: require('../assets/sounds/generated/sfx-ice-clear.wav'),
  sfxIceClick: require('../assets/sounds/generated/sfx-ice-click.wav'),
  sfxFirePlace: require('../assets/sounds/generated/sfx-fire-place.wav'),
  sfxFireClear: require('../assets/sounds/generated/sfx-fire-clear.wav'),
  sfxFireClick: require('../assets/sounds/generated/sfx-fire-click.wav'),
  sfxCoinPlace: require('../assets/sounds/generated/sfx-coin-place.wav'),
  sfxCoinClear: require('../assets/sounds/generated/sfx-coin-clear.wav'),
  sfxCoinClick: require('../assets/sounds/generated/sfx-coin-click.wav'),
  sfxDrumPlace: require('../assets/sounds/generated/sfx-drum-place.wav'),
  sfxDrumClear: require('../assets/sounds/generated/sfx-drum-clear.wav'),
  sfxDrumClick: require('../assets/sounds/generated/sfx-drum-click.wav'),
  sfxSciFiPlace: require('../assets/sounds/generated/sfx-scifi-place.wav'),
  sfxSciFiClear: require('../assets/sounds/generated/sfx-scifi-clear.wav'),
  sfxSciFiClick: require('../assets/sounds/generated/sfx-scifi-click.wav'),
  sfxSnapPlace: require('../assets/sounds/generated/sfx-snap-place.wav'),
  sfxSnapClear: require('../assets/sounds/generated/sfx-snap-clear.wav'),
  sfxSnapClick: require('../assets/sounds/generated/sfx-snap-click.wav'),
  sfxPluckPlace: require('../assets/sounds/generated/sfx-pluck-place.wav'),
  sfxPluckClear: require('../assets/sounds/generated/sfx-pluck-clear.wav'),
  sfxPluckClick: require('../assets/sounds/generated/sfx-pluck-click.wav'),
  sfxSoftPlace: require('../assets/sounds/generated/sfx-soft-place.wav'),
  sfxSoftClear: require('../assets/sounds/generated/sfx-soft-clear.wav'),
  sfxSoftClick: require('../assets/sounds/generated/sfx-soft-click.wav'),
  sfxCameraPlace: require('../assets/sounds/generated/sfx-camera-place.wav'),
  sfxCameraClear: require('../assets/sounds/generated/sfx-camera-clear.wav'),
  sfxCameraClick: require('../assets/sounds/generated/sfx-camera-click.wav'),
  sfxClockPlace: require('../assets/sounds/generated/sfx-clock-place.wav'),
  sfxClockClear: require('../assets/sounds/generated/sfx-clock-clear.wav'),
  sfxClockClick: require('../assets/sounds/generated/sfx-clock-click.wav'),
  sfxRubberPlace: require('../assets/sounds/generated/sfx-rubber-place.wav'),
  sfxRubberClear: require('../assets/sounds/generated/sfx-rubber-clear.wav'),
  sfxRubberClick: require('../assets/sounds/generated/sfx-rubber-click.wav'),
  sfxCeramicPlace: require('../assets/sounds/generated/sfx-ceramic-place.wav'),
  sfxCeramicClear: require('../assets/sounds/generated/sfx-ceramic-clear.wav'),
  sfxCeramicClick: require('../assets/sounds/generated/sfx-ceramic-click.wav'),
  sfxSparkPlace: require('../assets/sounds/generated/sfx-spark-place.wav'),
  sfxSparkClear: require('../assets/sounds/generated/sfx-spark-clear.wav'),
  sfxSparkClick: require('../assets/sounds/generated/sfx-spark-click.wav'),
  sfxBassPlace: require('../assets/sounds/generated/sfx-bass-place.wav'),
  sfxBassClear: require('../assets/sounds/generated/sfx-bass-clear.wav'),
  sfxBassClick: require('../assets/sounds/generated/sfx-bass-click.wav'),
  sfxDigitalPlace: require('../assets/sounds/generated/sfx-digital-place.wav'),
  sfxDigitalClear: require('../assets/sounds/generated/sfx-digital-clear.wav'),
  sfxDigitalClick: require('../assets/sounds/generated/sfx-digital-click.wav'),
  sfxMagicPlace: require('../assets/sounds/generated/sfx-magic-place.wav'),
  sfxMagicClear: require('../assets/sounds/generated/sfx-magic-clear.wav'),
  sfxMagicClick: require('../assets/sounds/generated/sfx-magic-click.wav'),
  sfxCrunchPlace: require('../assets/sounds/generated/sfx-crunch-place.wav'),
  sfxCrunchClear: require('../assets/sounds/generated/sfx-crunch-clear.wav'),
  sfxCrunchClick: require('../assets/sounds/generated/sfx-crunch-click.wav'),
  sfxWindPlace: require('../assets/sounds/generated/sfx-wind-place.wav'),
  sfxWindClear: require('../assets/sounds/generated/sfx-wind-clear.wav'),
  sfxWindClick: require('../assets/sounds/generated/sfx-wind-click.wav'),
} as const;

type BuiltInMusicTrackKey = keyof typeof MUSIC_TRACK_RESOURCES;
export type MusicTrackKey = BuiltInMusicTrackKey | 'musicCustom';
type SfxAssetKey = keyof typeof SFX_RESOURCES;
type SoundAssetKey = SfxAssetKey | BuiltInMusicTrackKey;

export type CustomAudioSourceKind = 'empty' | 'direct' | 'youtube' | 'spotify' | 'yandex' | 'other';

export interface CustomAudioSourceInfo {
  kind: CustomAudioSourceKind;
  canPlayInApp: boolean;
  label: string;
  message: string;
  url: string;
}

const DIRECT_AUDIO_URL_PATTERN = /\.(mp3|m4a|aac|wav|ogg|oga|flac|opus|m3u8)(\?|#|$)/i;

export function getCustomAudioSourceInfo(rawUrl: string): CustomAudioSourceInfo {
  const url = rawUrl.trim();
  if (!url) {
    return {
      kind: 'empty',
      canPlayInApp: false,
      label: 'No link',
      message: 'Paste a music or sound link.',
      url,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {
      kind: 'other',
      canPlayInApp: false,
      label: 'Invalid link',
      message: 'Use a full https:// link.',
      url,
    };
  }

  const host = parsed.hostname.toLowerCase();
  const provider =
    host.includes('youtube.com') || host.includes('youtu.be')
      ? 'youtube'
      : host.includes('spotify.com')
        ? 'spotify'
        : host.includes('music.yandex') || host.includes('yandex.')
          ? 'yandex'
          : null;

  if (provider) {
    const label = provider === 'youtube' ? 'YouTube' : provider === 'spotify' ? 'Spotify' : 'Yandex Music';
    return {
      kind: provider,
      canPlayInApp: false,
      label,
      message: `${label} link saved. Open it outside the game; in-game playback needs a direct audio stream.`,
      url,
    };
  }

  const isHttpAudio = (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
    (DIRECT_AUDIO_URL_PATTERN.test(parsed.pathname) || DIRECT_AUDIO_URL_PATTERN.test(parsed.href));

  return {
    kind: isHttpAudio ? 'direct' : 'other',
    canPlayInApp: isHttpAudio,
    label: isHttpAudio ? 'Direct audio' : 'Saved link',
    message: isHttpAudio
      ? 'Direct audio stream will play in game.'
      : 'Link saved. If it is not a direct audio stream, open it outside the game.',
    url,
  };
}

const MUSIC_PACK_TRACKS: Record<string, BuiltInMusicTrackKey> = {
  music_classic: 'backgroundMusic',
  music_lofi: 'musicLofi',
  music_arcade: 'musicArcade',
  music_cave: 'musicCave',
  music_space: 'musicSpace',
  music_lofi_rain: 'musicRainPiano',
  music_lofi_rooftop: 'musicJazz',
  music_lofi_midnight: 'musicSynthwave',
  music_lofi_cafe: 'musicBlues',
  music_lofi_clouds: 'musicDreamPop',
  music_arcade_turbo: 'musicDrumBass',
  music_arcade_combo: 'musicChiptune',
  music_arcade_pixel: 'musicTechno',
  music_arcade_neon: 'musicTrap',
  music_arcade_boss: 'musicOrchestral',
  music_cave_drip: 'musicIndustrial',
  music_cave_depth: 'musicAmbient',
  music_cave_crystal: 'musicChoir',
  music_cave_ember: 'musicPercussion',
  music_cave_echo: 'musicNoir',
  music_space_orbit: 'musicReggae',
  music_space_comet: 'musicTropical',
  music_space_nebula: 'musicFunk',
  music_space_satellite: 'musicGlitch',
  music_space_void: 'musicMarch',
  music_salsa: 'musicSalsa',
  music_hardstyle: 'musicHardstyle',
  music_music_box: 'musicMusicBox',
  music_harp: 'musicHarp',
  music_breakbeat: 'musicBreakbeat',
  music_dub: 'musicDub',
  music_garage: 'musicGarage',
  music_minimal: 'musicMinimal',
  music_waltz: 'musicWaltz',
  music_future_bass: 'musicFutureBass',
};

const MUSIC_TRACK_VOLUME_MULTIPLIERS: Partial<Record<BuiltInMusicTrackKey, number>> = {
  musicLofi: 0.78,
  musicCave: 0.72,
  musicSpace: 0.62,
  musicAmbient: 0.64,
  musicChoir: 0.66,
  musicMusicBox: 0.72,
  musicHarp: 0.7,
  musicArcade: 1.08,
  musicDrumBass: 1.05,
  musicTechno: 1.06,
  musicHardstyle: 0.95,
  musicTrap: 0.95,
  musicIndustrial: 0.82,
};

function getMusicVolumeMultiplier(musicPackId: string): number {
  const track = getMusicTrackKey(musicPackId);
  return track === 'musicCustom' ? 1 : MUSIC_TRACK_VOLUME_MULTIPLIERS[track] ?? 1;
}

function getSfxVolumeMultiplier(sfxPackId: string): number {
  return SFX_PACK_VOLUME_MULTIPLIERS[sfxPackId] ?? 1;
}

export function getMusicTrackKey(musicPackId: string): MusicTrackKey {
  return MUSIC_PACK_TRACKS[musicPackId] ?? 'backgroundMusic';
}

interface SfxRoleAssets {
  place: SfxAssetKey;
  clear: SfxAssetKey;
  click: SfxAssetKey;
}

const sfxPack = (base: string): SfxRoleAssets => ({
  place: `sfx${base}Place` as SfxAssetKey,
  clear: `sfx${base}Clear` as SfxAssetKey,
  click: `sfx${base}Click` as SfxAssetKey,
});

const SFX_PACK_ASSETS: Record<string, SfxRoleAssets> = {
  sfx_wood: sfxPack('Wood'),
  sfx_glass: sfxPack('Glass'),
  sfx_retro: sfxPack('Retro'),
  sfx_metal: sfxPack('Metal'),
  sfx_wood_oak: sfxPack('Paper'),
  sfx_wood_bamboo: sfxPack('Bubble'),
  sfx_wood_chest: sfxPack('Laser'),
  sfx_wood_plank: sfxPack('Stone'),
  sfx_wood_forest: sfxPack('Water'),
  sfx_glass_frost: sfxPack('Electric'),
  sfx_glass_prism: sfxPack('Toy'),
  sfx_glass_ice: sfxPack('Clay'),
  sfx_glass_neon: sfxPack('Bell'),
  sfx_glass_chime: sfxPack('Whoosh'),
  sfx_retro_chip: sfxPack('Typewriter'),
  sfx_retro_terminal: sfxPack('Spring'),
  sfx_retro_laser: sfxPack('Ice'),
  sfx_retro_coin: sfxPack('Fire'),
  sfx_retro_console: sfxPack('Coin'),
  sfx_metal_steel: sfxPack('Drum'),
  sfx_metal_anvil: sfxPack('SciFi'),
  sfx_metal_robot: sfxPack('Snap'),
  sfx_metal_cyber: sfxPack('Pluck'),
  sfx_metal_titan: sfxPack('Soft'),
  sfx_camera: sfxPack('Camera'),
  sfx_clock: sfxPack('Clock'),
  sfx_rubber: sfxPack('Rubber'),
  sfx_ceramic: sfxPack('Ceramic'),
  sfx_spark: sfxPack('Spark'),
  sfx_bass: sfxPack('Bass'),
  sfx_digital: sfxPack('Digital'),
  sfx_magic: sfxPack('Magic'),
  sfx_crunch: sfxPack('Crunch'),
  sfx_wind: sfxPack('Wind'),
};

const SFX_PACK_VOLUME_MULTIPLIERS: Record<string, number> = {
  sfx_glass: 0.92,
  sfx_retro: 1.05,
  sfx_metal: 1.12,
  sfx_wood: 0.98,
  sfx_bass: 0.82,
  sfx_clock: 0.88,
  sfx_ceramic: 0.9,
  sfx_spark: 0.86,
  sfx_wind: 0.76,
};

function getSfxRole(type: SoundType): keyof SfxRoleAssets | null {
  if (type === 'placeBlock') return 'place';
  if (type === 'breakLine' || type.startsWith('combo') || type === 'gameOver') return 'clear';
  if (type === 'menuClick' || type === 'buttonHover' || type === 'invalidPlacement') return 'click';
  return null;
}

export function mapSfxForPack(type: SoundType, sfxPackId: string): SfxAssetKey {
  const pack = SFX_PACK_ASSETS[sfxPackId];
  const role = getSfxRole(type);
  return pack && role ? pack[role] : type;
}

// Статичные импорты звуков вместо динамических
// В React Native require() требует статических путей
// Мы будем использовать функцию, которая выбирает правильный ресурс по имени
const getSoundResource = (type: SoundAssetKey) => {
  const mappedResource = SFX_RESOURCES[type as SfxAssetKey] ?? MUSIC_TRACK_RESOURCES[type as BuiltInMusicTrackKey];
  if (mappedResource) return mappedResource;
  // Используем switch вместо динамического пути
  switch (type) {
    case 'placeBlock': 
      try { return require('../assets/sounds/place-block.mp3'); } catch { return null; }
    case 'breakLine': 
      try { return require('../assets/sounds/break-line.mp3'); } catch { return null; }
    case 'comboBreak': 
      try { return require('../assets/sounds/combo-break.mp3'); } catch { return null; }
    case 'comboX2': 
      try { return require('../assets/sounds/combo-x2.mp3'); } catch { return null; }
    case 'comboX3': 
      try { return require('../assets/sounds/combo-x3.mp3'); } catch { return null; }
    case 'comboX4': 
      try { return require('../assets/sounds/combo-x4.mp3'); } catch { return null; }
    case 'comboX5': 
      try { return require('../assets/sounds/combo-x5.mp3'); } catch { return null; }
    case 'gameOver': 
      try { return require('../assets/sounds/game-over.mp3'); } catch { return null; }
    case 'menuClick': 
      try { return require('../assets/sounds/menu-click.mp3'); } catch { return null; }
    case 'invalidPlacement': 
      try { return require('../assets/sounds/invalid-placement.mp3'); } catch { return null; }
    case 'buttonHover': 
      try { return require('../assets/sounds/button-hover.mp3'); } catch { return null; }
    case 'backgroundMusic': 
      try { return require('../assets/sounds/background-music.mp3'); } catch { return null; }
    case 'musicLofi':
      try { return require('../assets/sounds/generated/music-lofi.wav'); } catch { return null; }
    case 'musicArcade':
      try { return require('../assets/sounds/generated/music-arcade.wav'); } catch { return null; }
    case 'musicCave':
      try { return require('../assets/sounds/generated/music-cave.wav'); } catch { return null; }
    case 'musicSpace':
      try { return require('../assets/sounds/generated/music-space.wav'); } catch { return null; }
    case 'sfxWoodPlace':
      try { return require('../assets/sounds/generated/sfx-wood-place.wav'); } catch { return null; }
    case 'sfxWoodClear':
      try { return require('../assets/sounds/generated/sfx-wood-clear.wav'); } catch { return null; }
    case 'sfxWoodClick':
      try { return require('../assets/sounds/generated/sfx-wood-click.wav'); } catch { return null; }
    case 'sfxGlassPlace':
      try { return require('../assets/sounds/generated/sfx-glass-place.wav'); } catch { return null; }
    case 'sfxGlassClear':
      try { return require('../assets/sounds/generated/sfx-glass-clear.wav'); } catch { return null; }
    case 'sfxGlassClick':
      try { return require('../assets/sounds/generated/sfx-glass-click.wav'); } catch { return null; }
    case 'sfxRetroPlace':
      try { return require('../assets/sounds/generated/sfx-retro-place.wav'); } catch { return null; }
    case 'sfxRetroClear':
      try { return require('../assets/sounds/generated/sfx-retro-clear.wav'); } catch { return null; }
    case 'sfxRetroClick':
      try { return require('../assets/sounds/generated/sfx-retro-click.wav'); } catch { return null; }
    case 'sfxMetalPlace':
      try { return require('../assets/sounds/generated/sfx-metal-place.wav'); } catch { return null; }
    case 'sfxMetalClear':
      try { return require('../assets/sounds/generated/sfx-metal-clear.wav'); } catch { return null; }
    case 'sfxMetalClick':
      try { return require('../assets/sounds/generated/sfx-metal-click.wav'); } catch { return null; }
    default:
      return null;
  }
};

// Класс для управления звуковыми эффектами
class SoundManager {
  private sounds: Map<string, AudioPlayer> = new Map();
  private activeSfxPlayers: Set<AudioPlayer> = new Set();
  private musicTracks: Map<MusicTrackKey, AudioPlayer> = new Map();
  private currentMusicKey: MusicTrackKey = 'backgroundMusic';
  private musicPlaying = false;
  private customMusicUrl: string | null = null;
  private initialized = false;
  private musicRequestId = 0;
  private webAudioUnlocked = Platform.OS !== 'web';
  private webAudioUnlockListening = false;
  private pendingWebMusic: { volume?: number; musicPackId: string } | null = null;

  // Загрузка настроек
  async loadSettings() {
    try {
      const musicVolume = await AsyncStorage.getItem(MUSIC_VOLUME_KEY);
      const sfxVolume = await AsyncStorage.getItem(SFX_VOLUME_KEY);
      const musicEnabled = await AsyncStorage.getItem(MUSIC_ENABLED_KEY);
      const sfxEnabled = await AsyncStorage.getItem(SFX_ENABLED_KEY);
      
      return {
        musicVolume: musicVolume !== null ? parseFloat(musicVolume) : 0.5,
        sfxVolume: sfxVolume !== null ? parseFloat(sfxVolume) : 0.7,
        musicEnabled: musicEnabled !== null ? musicEnabled === 'true' : true,
        sfxEnabled: sfxEnabled !== null ? sfxEnabled === 'true' : true
      };
    } catch (error) {
      console.error('Error loading sound settings:', error);
      return {
        musicVolume: 0.5,
        sfxVolume: 0.7,
        musicEnabled: true,
        sfxEnabled: true
      };
    }
  }

  // Сохранение настроек
  async saveSettings(settings: {
    musicVolume?: number;
    sfxVolume?: number;
    musicEnabled?: boolean;
    sfxEnabled?: boolean;
  }) {
    try {
      if (settings.musicVolume !== undefined) {
        await AsyncStorage.setItem(MUSIC_VOLUME_KEY, settings.musicVolume.toString());
      }
      if (settings.sfxVolume !== undefined) {
        await AsyncStorage.setItem(SFX_VOLUME_KEY, settings.sfxVolume.toString());
      }
      if (settings.musicEnabled !== undefined) {
        await AsyncStorage.setItem(MUSIC_ENABLED_KEY, settings.musicEnabled.toString());
      }
      if (settings.sfxEnabled !== undefined) {
        await AsyncStorage.setItem(SFX_ENABLED_KEY, settings.sfxEnabled.toString());
      }
    } catch (error) {
      console.error('Error saving sound settings:', error);
    }
  }

  // Safe load of sound file with error handling
  private async loadSoundSafely(key: SfxAssetKey): Promise<AudioPlayer | null> {
    try {
      const soundResource = getSoundResource(key);
      if (!soundResource) {
        console.log(`Resource not found for sound "${key}"`);
        return null;
      }

      const sound = createAudioPlayer(soundResource);
      if (sound) {
        this.sounds.set(key, sound);
        return sound;
      }
    } catch (error) {
      console.log(`Error loading sound "${key}": ${error}`);
    }
    return null;
  }

  private async loadMusicSafely(key: MusicTrackKey): Promise<AudioPlayer | null> {
    try {
      if (key === 'musicCustom') return null;

      const soundResource = getSoundResource(key);
      if (!soundResource) {
        console.log(`Resource not found for music "${key}"`);
        return null;
      }

      const music = createAudioPlayer(soundResource);
      if (music) {
        music.loop = true;
        this.musicTracks.set(key, music);
        return music;
      }
    } catch (error) {
      console.log(`Error loading music "${key}": ${error}`);
    }
    return null;
  }

  private async getOrLoadSound(key: SfxAssetKey): Promise<AudioPlayer | null> {
    return this.sounds.get(key) ?? await this.loadSoundSafely(key);
  }

  private async getOrLoadMusic(key: MusicTrackKey): Promise<AudioPlayer | null> {
    return this.musicTracks.get(key) ?? await this.loadMusicSafely(key);
  }

  private cleanupSfxPlayer(player: AudioPlayer, delayMs = 1200) {
    this.activeSfxPlayers.add(player);
    setTimeout(() => {
      try {
        player.pause();
        player.remove();
      } catch {}
      this.activeSfxPlayers.delete(player);
    }, delayMs);
  }

  private canPlayOneShotNow(): boolean {
    if (Platform.OS !== 'web') {
      return true;
    }

    if (typeof navigator === 'undefined') {
      return false;
    }

    const userActivation = (navigator as Navigator & {
      userActivation?: { isActive?: boolean };
    }).userActivation;

    return userActivation?.isActive === true;
  }

  private playOneShot(resource: unknown, volume: number, cleanupDelayMs?: number) {
    if (!this.canPlayOneShotNow()) {
      return;
    }

    const sound = createAudioPlayer(resource as any, { keepAudioSessionActive: true });
    sound.volume = volume;
    sound.seekTo(0);
    sound.play();
    this.cleanupSfxPlayer(sound, cleanupDelayMs);
  }

  private pauseMusicTracksExcept(activeKey: MusicTrackKey) {
    this.musicTracks.forEach((music, key) => {
      if (key !== activeKey) {
        music.pause();
        music.seekTo(0);
      }
    });
  }

  // Инициализация звуков
  private completeWebAudioUnlock = () => {
    if (Platform.OS !== 'web') return;

    this.webAudioUnlocked = true;
    this.webAudioUnlockListening = false;

    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this.completeWebAudioUnlock, true);
      window.removeEventListener('keydown', this.completeWebAudioUnlock, true);
      window.removeEventListener('touchend', this.completeWebAudioUnlock, true);
    }

    this.pendingWebMusic = null;
  };

  private waitForWebAudioUnlock(volume: number | undefined, musicPackId: string): boolean {
    if (Platform.OS !== 'web' || this.webAudioUnlocked) {
      return false;
    }

    this.pendingWebMusic = { volume, musicPackId };

    if (!this.webAudioUnlockListening && typeof window !== 'undefined') {
      this.webAudioUnlockListening = true;
      window.addEventListener('pointerdown', this.completeWebAudioUnlock, { once: true, capture: true });
      window.addEventListener('keydown', this.completeWebAudioUnlock, { once: true, capture: true });
      window.addEventListener('touchend', this.completeWebAudioUnlock, { once: true, capture: true });
    }

    return true;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      await setAudioModeAsync(getAudioModeOptions()).catch(err => console.log('Error setting audio mode:', err));
      this.initialized = true;
    } catch (error) {
      console.error('Error initializing sounds:', error);
    }
  }

  // Get appropriate combo sound based on combo count
  getComboSound(comboCount: number): SoundType {
    if (comboCount >= 5) return 'comboX5';
    if (comboCount >= 4) return 'comboX4';
    if (comboCount >= 3) return 'comboX3';
    if (comboCount >= 2) return 'comboX2';
    return 'comboBreak';
  }

  // Воспроизведение звукового эффекта
  async playSfx(type: SfxAssetKey, volume?: number, sfxPackId?: string) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      
      if (sfxPackId === 'sfx_custom') {
        const customUrl = await AsyncStorage.getItem(CUSTOM_SFX_URL_KEY);
        const source = getCustomAudioSourceInfo(customUrl || '');
        if (source.canPlayInApp) {
          try {
            this.playOneShot(source.url, volume ?? 1, 2200);
            return;
          } catch (error) {
            console.log("Custom SFX could not play, falling back to default:", error);
          }
        }
      }

      const soundResource = getSoundResource(type);
      if (soundResource) {
        this.playOneShot(soundResource, volume ?? 1);
      } else {
        console.log('Sound not found:', type);
      }
    } catch (error) {
      console.error(`Error playing sound ${type}:`, error);
    }
  }

  // Воспроизведение фоновой музыки
  async playMusic(volume?: number, musicPackId: string = 'music_classic') {
    if (this.waitForWebAudioUnlock(volume, musicPackId)) {
      return;
    }

    const requestId = ++this.musicRequestId;

    try {
      if (!this.initialized) {
        await this.initialize();
      }

      if (requestId !== this.musicRequestId) return;

      if (musicPackId === 'music_custom') {
        const customUrl = await AsyncStorage.getItem(CUSTOM_MUSIC_URL_KEY);
        if (requestId !== this.musicRequestId) return;

        const source = getCustomAudioSourceInfo(customUrl || '');
        if (source.canPlayInApp) {
          try {
            const customKey: MusicTrackKey = 'musicCustom';
            let customMusic = this.musicTracks.get(customKey);
            if (!customMusic || this.customMusicUrl !== source.url) {
              customMusic?.pause();
              customMusic = createAudioPlayer(source.url);
              customMusic.loop = true;
              this.musicTracks.set(customKey, customMusic);
              this.customMusicUrl = source.url;
              this.musicPlaying = false;
            }

            if (this.currentMusicKey !== customKey) {
              this.pauseMusicTracksExcept(customKey);
              this.currentMusicKey = customKey;
              this.musicPlaying = false;
            }

            if (requestId !== this.musicRequestId) return;

            customMusic.volume = volume ?? 1;
            if (!this.musicPlaying) {
              customMusic.play();
              this.musicPlaying = true;
            }
            return;
          } catch (error) {
            console.log("Custom music could not play, falling back to classic:", error);
          }
        } else if (source.kind !== 'empty') {
          await this.pauseMusic();
          return;
        }
      }

      const musicKey = getMusicTrackKey(musicPackId);
      const nextMusic = await this.getOrLoadMusic(musicKey);
      if (requestId !== this.musicRequestId) return;
      if (!nextMusic) return;

      if (musicKey !== this.currentMusicKey) {
        this.pauseMusicTracksExcept(musicKey);
        this.currentMusicKey = musicKey;
        this.musicPlaying = false;
      } else {
        this.pauseMusicTracksExcept(musicKey);
      }

      nextMusic.volume = volume ?? 1;
      if (!this.musicPlaying) {
        nextMusic.play();
        this.musicPlaying = true;
      }
    } catch (error) {
      if (String(error).includes('NotAllowedError')) {
        console.log('Background music will start after user interaction.');
        return;
      }
      console.error('Error playing background music:', error);
    }
  }

  // Остановка фоновой музыки
  async stopMusic() {
    try {
      this.musicRequestId++;
      this.musicTracks.forEach((music) => {
        music.pause();
        music.seekTo(0);
      });
      this.musicPlaying = false;
    } catch (error) {
      console.error('Error stopping background music:', error);
    }
  }

  // Пауза фоновой музыки
  async pauseMusic() {
    try {
      this.musicRequestId++;
      this.musicTracks.get(this.currentMusicKey)?.pause();
      this.musicPlaying = false;
    } catch (error) {
      console.error('Error pausing background music:', error);
    }
  }

  // Обновление громкости фоновой музыки
  async updateMusicVolume(volume: number, musicPackId: string = 'music_classic') {
    try {
      let musicKey = getMusicTrackKey(musicPackId);
      if (musicPackId === 'music_custom') {
        musicKey = 'musicCustom';
      }
      const music = this.musicTracks.get(musicKey);
      if (music) {
        music.volume = volume;
      }
    } catch (error) {
      console.error('Error updating background music volume:', error);
    }
  }
}

// Экспортируем экземпляр менеджера звуков
export const soundManager = new SoundManager();

// Хук для управления звуком
export function useSoundSettings(options: { manageMusicPlayback?: boolean } = {}) {
  const manageMusicPlayback = options.manageMusicPlayback ?? false;
  const [musicVolume, setMusicVolume] = useAtom(musicVolumeAtom);
  const [sfxVolume, setSfxVolume] = useAtom(sfxVolumeAtom);
  const [musicEnabled, setMusicEnabled] = useAtom(musicEnabledAtom);
  const [sfxEnabled, setSfxEnabled] = useAtom(sfxEnabledAtom);
  const shopState = useAtomValue(shopStateAtom);
  const musicPackId = shopState.equipped.music;
  const sfxPackId = shopState.equipped.sfx;

  const updateMusicVolume = async (volume: number) => {
    setMusicVolume(volume);
    await soundManager.saveSettings({ musicVolume: volume });
    await soundManager.updateMusicVolume(musicEnabled ? volume * getMusicVolumeMultiplier(musicPackId) : 0, musicPackId);
  };

  const updateSfxVolume = async (volume: number) => {
    setSfxVolume(volume);
    await soundManager.saveSettings({ sfxVolume: volume });
  };

  const toggleMusic = async (enabled: boolean) => {
    setMusicEnabled(enabled);
    await soundManager.saveSettings({ musicEnabled: enabled });
    
    if (enabled) {
      await soundManager.playMusic(musicVolume * getMusicVolumeMultiplier(musicPackId), musicPackId);
    } else {
      await soundManager.pauseMusic();
    }
  };

  const toggleSfx = async (enabled: boolean) => {
    setSfxEnabled(enabled);
    await soundManager.saveSettings({ sfxEnabled: enabled });
  };

  const playSfx = async (type: SoundType) => {
    if (sfxEnabled) {
      await soundManager.playSfx(mapSfxForPack(type, sfxPackId), sfxVolume * getSfxVolumeMultiplier(sfxPackId), sfxPackId);
    }
  };

  // Play combo sound based on combo count
  const playComboSound = async (comboCount: number) => {
    if (sfxEnabled) {
      const soundType = soundManager.getComboSound(comboCount);
      await soundManager.playSfx(mapSfxForPack(soundType, sfxPackId), sfxVolume * getSfxVolumeMultiplier(sfxPackId), sfxPackId);
    }
  };

  // Инициализация при первом использовании хука
  const initialize = async () => {
    await soundManager.initialize();
    const settings = await soundManager.loadSettings();
    
    setMusicVolume(settings.musicVolume);
    setSfxVolume(settings.sfxVolume);
    setMusicEnabled(settings.musicEnabled);
    setSfxEnabled(settings.sfxEnabled);
    
    if (manageMusicPlayback && settings.musicEnabled) {
      await soundManager.playMusic(settings.musicVolume * getMusicVolumeMultiplier(musicPackId), musicPackId);
    }
  };

  useEffect(() => {
    if (!manageMusicPlayback) {
      return;
    }

    if (musicEnabled) {
      soundManager.playMusic(musicVolume * getMusicVolumeMultiplier(musicPackId), musicPackId);
    } else {
      soundManager.pauseMusic();
    }
  }, [manageMusicPlayback, musicEnabled, musicPackId, musicVolume]);

  return {
    musicVolume,
    sfxVolume,
    musicEnabled,
    sfxEnabled,
    updateMusicVolume,
    updateSfxVolume,
    toggleMusic,
    toggleSfx,
    playSfx,
    playComboSound,
    initialize
  };
}
