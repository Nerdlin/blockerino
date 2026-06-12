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
const SOFT_LOOP_WINDOW_SECONDS = 0.9;
const SOFT_LOOP_INTERVAL_MS = 250;
const SOFT_LOOP_FADE_STEPS = 6;
const SOFT_LOOP_FADE_STEP_MS = 90;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
  musicLofi: require('../assets/sounds/generated/music-lofi.mp3'),
  musicArcade: require('../assets/sounds/generated/music-arcade.mp3'),
  musicCave: require('../assets/sounds/generated/music-cave.mp3'),
  musicSpace: require('../assets/sounds/generated/music-space.mp3'),
  musicRainPiano: require('../assets/sounds/generated/music-rain-piano.mp3'),
  musicJazz: require('../assets/sounds/generated/music-jazz.mp3'),
  musicSynthwave: require('../assets/sounds/generated/music-synthwave.mp3'),
  musicBlues: require('../assets/sounds/generated/music-blues.mp3'),
  musicDreamPop: require('../assets/sounds/generated/music-dream-pop.mp3'),
  musicDrumBass: require('../assets/sounds/generated/music-drum-bass.mp3'),
  musicChiptune: require('../assets/sounds/generated/music-chiptune.mp3'),
  musicTechno: require('../assets/sounds/generated/music-techno.mp3'),
  musicTrap: require('../assets/sounds/generated/music-trap.mp3'),
  musicOrchestral: require('../assets/sounds/generated/music-orchestral.mp3'),
  musicIndustrial: require('../assets/sounds/generated/music-industrial.mp3'),
  musicAmbient: require('../assets/sounds/generated/music-ambient.mp3'),
  musicChoir: require('../assets/sounds/generated/music-choir.mp3'),
  musicPercussion: require('../assets/sounds/generated/music-percussion.mp3'),
  musicNoir: require('../assets/sounds/generated/music-noir.mp3'),
  musicReggae: require('../assets/sounds/generated/music-reggae.mp3'),
  musicTropical: require('../assets/sounds/generated/music-tropical.mp3'),
  musicFunk: require('../assets/sounds/generated/music-funk.mp3'),
  musicGlitch: require('../assets/sounds/generated/music-glitch.mp3'),
  musicMarch: require('../assets/sounds/generated/music-march.mp3'),
  musicSalsa: require('../assets/sounds/generated/music-salsa.mp3'),
  musicHardstyle: require('../assets/sounds/generated/music-hardstyle.mp3'),
  musicMusicBox: require('../assets/sounds/generated/music-music-box.mp3'),
  musicHarp: require('../assets/sounds/generated/music-harp.mp3'),
  musicBreakbeat: require('../assets/sounds/generated/music-breakbeat.mp3'),
  musicDub: require('../assets/sounds/generated/music-dub.mp3'),
  musicGarage: require('../assets/sounds/generated/music-garage.mp3'),
  musicMinimal: require('../assets/sounds/generated/music-minimal.mp3'),
  musicWaltz: require('../assets/sounds/generated/music-waltz.mp3'),
  musicFutureBass: require('../assets/sounds/generated/music-future-bass.mp3'),
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
  sfxWoodPlace: require('../assets/sounds/generated/sfx-wood-place.mp3'),
  sfxWoodClear: require('../assets/sounds/generated/sfx-wood-clear.mp3'),
  sfxWoodClick: require('../assets/sounds/generated/sfx-wood-click.mp3'),
  sfxGlassPlace: require('../assets/sounds/generated/sfx-glass-place.mp3'),
  sfxGlassClear: require('../assets/sounds/generated/sfx-glass-clear.mp3'),
  sfxGlassClick: require('../assets/sounds/generated/sfx-glass-click.mp3'),
  sfxRetroPlace: require('../assets/sounds/generated/sfx-retro-place.mp3'),
  sfxRetroClear: require('../assets/sounds/generated/sfx-retro-clear.mp3'),
  sfxRetroClick: require('../assets/sounds/generated/sfx-retro-click.mp3'),
  sfxMetalPlace: require('../assets/sounds/generated/sfx-metal-place.mp3'),
  sfxMetalClear: require('../assets/sounds/generated/sfx-metal-clear.mp3'),
  sfxMetalClick: require('../assets/sounds/generated/sfx-metal-click.mp3'),
  sfxPaperPlace: require('../assets/sounds/generated/sfx-paper-place.mp3'),
  sfxPaperClear: require('../assets/sounds/generated/sfx-paper-clear.mp3'),
  sfxPaperClick: require('../assets/sounds/generated/sfx-paper-click.mp3'),
  sfxBubblePlace: require('../assets/sounds/generated/sfx-bubble-place.mp3'),
  sfxBubbleClear: require('../assets/sounds/generated/sfx-bubble-clear.mp3'),
  sfxBubbleClick: require('../assets/sounds/generated/sfx-bubble-click.mp3'),
  sfxLaserPlace: require('../assets/sounds/generated/sfx-laser-place.mp3'),
  sfxLaserClear: require('../assets/sounds/generated/sfx-laser-clear.mp3'),
  sfxLaserClick: require('../assets/sounds/generated/sfx-laser-click.mp3'),
  sfxStonePlace: require('../assets/sounds/generated/sfx-stone-place.mp3'),
  sfxStoneClear: require('../assets/sounds/generated/sfx-stone-clear.mp3'),
  sfxStoneClick: require('../assets/sounds/generated/sfx-stone-click.mp3'),
  sfxWaterPlace: require('../assets/sounds/generated/sfx-water-place.mp3'),
  sfxWaterClear: require('../assets/sounds/generated/sfx-water-clear.mp3'),
  sfxWaterClick: require('../assets/sounds/generated/sfx-water-click.mp3'),
  sfxElectricPlace: require('../assets/sounds/generated/sfx-electric-place.mp3'),
  sfxElectricClear: require('../assets/sounds/generated/sfx-electric-clear.mp3'),
  sfxElectricClick: require('../assets/sounds/generated/sfx-electric-click.mp3'),
  sfxToyPlace: require('../assets/sounds/generated/sfx-toy-place.mp3'),
  sfxToyClear: require('../assets/sounds/generated/sfx-toy-clear.mp3'),
  sfxToyClick: require('../assets/sounds/generated/sfx-toy-click.mp3'),
  sfxClayPlace: require('../assets/sounds/generated/sfx-clay-place.mp3'),
  sfxClayClear: require('../assets/sounds/generated/sfx-clay-clear.mp3'),
  sfxClayClick: require('../assets/sounds/generated/sfx-clay-click.mp3'),
  sfxBellPlace: require('../assets/sounds/generated/sfx-bell-place.mp3'),
  sfxBellClear: require('../assets/sounds/generated/sfx-bell-clear.mp3'),
  sfxBellClick: require('../assets/sounds/generated/sfx-bell-click.mp3'),
  sfxWhooshPlace: require('../assets/sounds/generated/sfx-whoosh-place.mp3'),
  sfxWhooshClear: require('../assets/sounds/generated/sfx-whoosh-clear.mp3'),
  sfxWhooshClick: require('../assets/sounds/generated/sfx-whoosh-click.mp3'),
  sfxTypewriterPlace: require('../assets/sounds/generated/sfx-typewriter-place.mp3'),
  sfxTypewriterClear: require('../assets/sounds/generated/sfx-typewriter-clear.mp3'),
  sfxTypewriterClick: require('../assets/sounds/generated/sfx-typewriter-click.mp3'),
  sfxSpringPlace: require('../assets/sounds/generated/sfx-spring-place.mp3'),
  sfxSpringClear: require('../assets/sounds/generated/sfx-spring-clear.mp3'),
  sfxSpringClick: require('../assets/sounds/generated/sfx-spring-click.mp3'),
  sfxIcePlace: require('../assets/sounds/generated/sfx-ice-place.mp3'),
  sfxIceClear: require('../assets/sounds/generated/sfx-ice-clear.mp3'),
  sfxIceClick: require('../assets/sounds/generated/sfx-ice-click.mp3'),
  sfxFirePlace: require('../assets/sounds/generated/sfx-fire-place.mp3'),
  sfxFireClear: require('../assets/sounds/generated/sfx-fire-clear.mp3'),
  sfxFireClick: require('../assets/sounds/generated/sfx-fire-click.mp3'),
  sfxCoinPlace: require('../assets/sounds/generated/sfx-coin-place.mp3'),
  sfxCoinClear: require('../assets/sounds/generated/sfx-coin-clear.mp3'),
  sfxCoinClick: require('../assets/sounds/generated/sfx-coin-click.mp3'),
  sfxDrumPlace: require('../assets/sounds/generated/sfx-drum-place.mp3'),
  sfxDrumClear: require('../assets/sounds/generated/sfx-drum-clear.mp3'),
  sfxDrumClick: require('../assets/sounds/generated/sfx-drum-click.mp3'),
  sfxSciFiPlace: require('../assets/sounds/generated/sfx-scifi-place.mp3'),
  sfxSciFiClear: require('../assets/sounds/generated/sfx-scifi-clear.mp3'),
  sfxSciFiClick: require('../assets/sounds/generated/sfx-scifi-click.mp3'),
  sfxSnapPlace: require('../assets/sounds/generated/sfx-snap-place.mp3'),
  sfxSnapClear: require('../assets/sounds/generated/sfx-snap-clear.mp3'),
  sfxSnapClick: require('../assets/sounds/generated/sfx-snap-click.mp3'),
  sfxPluckPlace: require('../assets/sounds/generated/sfx-pluck-place.mp3'),
  sfxPluckClear: require('../assets/sounds/generated/sfx-pluck-clear.mp3'),
  sfxPluckClick: require('../assets/sounds/generated/sfx-pluck-click.mp3'),
  sfxSoftPlace: require('../assets/sounds/generated/sfx-soft-place.mp3'),
  sfxSoftClear: require('../assets/sounds/generated/sfx-soft-clear.mp3'),
  sfxSoftClick: require('../assets/sounds/generated/sfx-soft-click.mp3'),
  sfxCameraPlace: require('../assets/sounds/generated/sfx-camera-place.mp3'),
  sfxCameraClear: require('../assets/sounds/generated/sfx-camera-clear.mp3'),
  sfxCameraClick: require('../assets/sounds/generated/sfx-camera-click.mp3'),
  sfxClockPlace: require('../assets/sounds/generated/sfx-clock-place.mp3'),
  sfxClockClear: require('../assets/sounds/generated/sfx-clock-clear.mp3'),
  sfxClockClick: require('../assets/sounds/generated/sfx-clock-click.mp3'),
  sfxRubberPlace: require('../assets/sounds/generated/sfx-rubber-place.mp3'),
  sfxRubberClear: require('../assets/sounds/generated/sfx-rubber-clear.mp3'),
  sfxRubberClick: require('../assets/sounds/generated/sfx-rubber-click.mp3'),
  sfxCeramicPlace: require('../assets/sounds/generated/sfx-ceramic-place.mp3'),
  sfxCeramicClear: require('../assets/sounds/generated/sfx-ceramic-clear.mp3'),
  sfxCeramicClick: require('../assets/sounds/generated/sfx-ceramic-click.mp3'),
  sfxSparkPlace: require('../assets/sounds/generated/sfx-spark-place.mp3'),
  sfxSparkClear: require('../assets/sounds/generated/sfx-spark-clear.mp3'),
  sfxSparkClick: require('../assets/sounds/generated/sfx-spark-click.mp3'),
  sfxBassPlace: require('../assets/sounds/generated/sfx-bass-place.mp3'),
  sfxBassClear: require('../assets/sounds/generated/sfx-bass-clear.mp3'),
  sfxBassClick: require('../assets/sounds/generated/sfx-bass-click.mp3'),
  sfxDigitalPlace: require('../assets/sounds/generated/sfx-digital-place.mp3'),
  sfxDigitalClear: require('../assets/sounds/generated/sfx-digital-clear.mp3'),
  sfxDigitalClick: require('../assets/sounds/generated/sfx-digital-click.mp3'),
  sfxMagicPlace: require('../assets/sounds/generated/sfx-magic-place.mp3'),
  sfxMagicClear: require('../assets/sounds/generated/sfx-magic-clear.mp3'),
  sfxMagicClick: require('../assets/sounds/generated/sfx-magic-click.mp3'),
  sfxCrunchPlace: require('../assets/sounds/generated/sfx-crunch-place.mp3'),
  sfxCrunchClear: require('../assets/sounds/generated/sfx-crunch-clear.mp3'),
  sfxCrunchClick: require('../assets/sounds/generated/sfx-crunch-click.mp3'),
  sfxWindPlace: require('../assets/sounds/generated/sfx-wind-place.mp3'),
  sfxWindClear: require('../assets/sounds/generated/sfx-wind-clear.mp3'),
  sfxWindClick: require('../assets/sounds/generated/sfx-wind-click.mp3'),
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

export function hasMusicTrackForPack(musicPackId: string): boolean {
  return musicPackId === 'music_custom' || Object.prototype.hasOwnProperty.call(MUSIC_PACK_TRACKS, musicPackId);
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

export function hasSfxAssetsForPack(sfxPackId: string): boolean {
  return sfxPackId === 'sfx_custom' || sfxPackId === 'sfx_classic' || Object.prototype.hasOwnProperty.call(SFX_PACK_ASSETS, sfxPackId);
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
      try { return require('../assets/sounds/generated/music-lofi.mp3'); } catch { return null; }
    case 'musicArcade':
      try { return require('../assets/sounds/generated/music-arcade.mp3'); } catch { return null; }
    case 'musicCave':
      try { return require('../assets/sounds/generated/music-cave.mp3'); } catch { return null; }
    case 'musicSpace':
      try { return require('../assets/sounds/generated/music-space.mp3'); } catch { return null; }
    case 'sfxWoodPlace':
      try { return require('../assets/sounds/generated/sfx-wood-place.mp3'); } catch { return null; }
    case 'sfxWoodClear':
      try { return require('../assets/sounds/generated/sfx-wood-clear.mp3'); } catch { return null; }
    case 'sfxWoodClick':
      try { return require('../assets/sounds/generated/sfx-wood-click.mp3'); } catch { return null; }
    case 'sfxGlassPlace':
      try { return require('../assets/sounds/generated/sfx-glass-place.mp3'); } catch { return null; }
    case 'sfxGlassClear':
      try { return require('../assets/sounds/generated/sfx-glass-clear.mp3'); } catch { return null; }
    case 'sfxGlassClick':
      try { return require('../assets/sounds/generated/sfx-glass-click.mp3'); } catch { return null; }
    case 'sfxRetroPlace':
      try { return require('../assets/sounds/generated/sfx-retro-place.mp3'); } catch { return null; }
    case 'sfxRetroClear':
      try { return require('../assets/sounds/generated/sfx-retro-clear.mp3'); } catch { return null; }
    case 'sfxRetroClick':
      try { return require('../assets/sounds/generated/sfx-retro-click.mp3'); } catch { return null; }
    case 'sfxMetalPlace':
      try { return require('../assets/sounds/generated/sfx-metal-place.mp3'); } catch { return null; }
    case 'sfxMetalClear':
      try { return require('../assets/sounds/generated/sfx-metal-clear.mp3'); } catch { return null; }
    case 'sfxMetalClick':
      try { return require('../assets/sounds/generated/sfx-metal-click.mp3'); } catch { return null; }
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
  private musicLoopTimer: ReturnType<typeof setInterval> | null = null;
  private musicLooping = false;
  private currentMusicVolume = 1;
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
        music.loop = false;
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
    const cleanupDelayMs = Platform.OS === 'android' ? Math.max(delayMs, 5000) : delayMs;
    setTimeout(() => {
      try {
        player.pause();
        void player.seekTo(0);
        player.remove();
      } catch {}
      this.activeSfxPlayers.delete(player);
    }, cleanupDelayMs);
  }

  private stopSoftLoopMonitor() {
    if (this.musicLoopTimer) {
      clearInterval(this.musicLoopTimer);
      this.musicLoopTimer = null;
    }
    this.musicLooping = false;
  }

  private startSoftLoopMonitor() {
    this.stopSoftLoopMonitor();
    this.musicLoopTimer = setInterval(() => {
      void this.maybeSoftLoopCurrentMusic();
    }, SOFT_LOOP_INTERVAL_MS);
  }

  private async maybeSoftLoopCurrentMusic() {
    if (!this.musicPlaying || this.musicLooping) {
      return;
    }

    const music = this.musicTracks.get(this.currentMusicKey);
    if (!music) {
      return;
    }

    const duration = Number(music.duration) || 0;
    const currentTime = Number(music.currentTime) || 0;
    if (duration <= SOFT_LOOP_WINDOW_SECONDS + 0.5 || duration - currentTime > SOFT_LOOP_WINDOW_SECONDS) {
      return;
    }

    await this.softRestartCurrentMusic();
  }

  private async softRestartCurrentMusic() {
    if (this.musicLooping) {
      return;
    }

    const requestId = this.musicRequestId;
    const music = this.musicTracks.get(this.currentMusicKey);
    if (!music || !this.musicPlaying) {
      return;
    }

    this.musicLooping = true;
    const targetVolume = this.currentMusicVolume;

    try {
      for (let step = 1; step <= SOFT_LOOP_FADE_STEPS; step += 1) {
        if (requestId !== this.musicRequestId || !this.musicPlaying) return;
        music.volume = targetVolume * (1 - step / SOFT_LOOP_FADE_STEPS);
        await delay(SOFT_LOOP_FADE_STEP_MS);
      }

      if (requestId !== this.musicRequestId || !this.musicPlaying) return;
      await music.seekTo(0);
      music.play();

      for (let step = 1; step <= SOFT_LOOP_FADE_STEPS; step += 1) {
        if (requestId !== this.musicRequestId || !this.musicPlaying) return;
        music.volume = targetVolume * (step / SOFT_LOOP_FADE_STEPS);
        await delay(SOFT_LOOP_FADE_STEP_MS);
      }

      music.volume = targetVolume;
    } catch (error) {
      console.log('Soft music loop failed:', error);
    } finally {
      this.musicLooping = false;
    }
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
        void music.seekTo(0);
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
              customMusic.loop = false;
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

            this.currentMusicVolume = volume ?? 1;
            customMusic.volume = this.currentMusicVolume;
            if (!this.musicPlaying) {
              customMusic.play();
              this.musicPlaying = true;
            }
            this.startSoftLoopMonitor();
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

      this.currentMusicVolume = volume ?? 1;
      nextMusic.volume = this.currentMusicVolume;
      if (!this.musicPlaying) {
        nextMusic.play();
        this.musicPlaying = true;
      }
      this.startSoftLoopMonitor();
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
      this.stopSoftLoopMonitor();
      this.musicTracks.forEach((music) => {
        music.pause();
        void music.seekTo(0);
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
      this.stopSoftLoopMonitor();
      this.musicTracks.forEach((music) => {
        music.pause();
      });
      this.musicPlaying = false;
    } catch (error) {
      console.error('Error pausing background music:', error);
    }
  }

  stopSfx() {
    this.activeSfxPlayers.forEach((player) => {
      try {
        player.pause();
        void player.seekTo(0);
        player.remove();
      } catch {}
    });
    this.activeSfxPlayers.clear();

    this.sounds.forEach((sound) => {
      try {
        sound.pause();
        void sound.seekTo(0);
      } catch {}
    });
  }

  // Обновление громкости фоновой музыки
  async updateMusicVolume(volume: number, musicPackId: string = 'music_classic') {
    try {
      this.currentMusicVolume = volume;
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
      await soundManager.stopMusic();
    }
  };

  const toggleSfx = async (enabled: boolean) => {
    setSfxEnabled(enabled);
    await soundManager.saveSettings({ sfxEnabled: enabled });
    if (!enabled) {
      soundManager.stopSfx();
    }
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
      soundManager.stopMusic();
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
