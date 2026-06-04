import { createAudioPlayer, AudioPlayer, setAudioModeAsync } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { atom, useAtom, useAtomValue } from 'jotai';
import { shopStateAtom } from './Shop';
import { useEffect } from 'react';

// Ключи для сохранения настроек
const MUSIC_VOLUME_KEY = 'MUSIC_VOLUME';
const SFX_VOLUME_KEY = 'SFX_VOLUME';
const MUSIC_ENABLED_KEY = 'MUSIC_ENABLED';
const SFX_ENABLED_KEY = 'SFX_ENABLED';

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

export type MusicTrackKey =
  | 'backgroundMusic'
  | 'musicLofi'
  | 'musicArcade'
  | 'musicCave'
  | 'musicSpace'
  | 'musicCustom';

type GeneratedSfxKey =
  | 'sfxWoodPlace'
  | 'sfxWoodClear'
  | 'sfxWoodClick'
  | 'sfxGlassPlace'
  | 'sfxGlassClear'
  | 'sfxGlassClick'
  | 'sfxRetroPlace'
  | 'sfxRetroClear'
  | 'sfxRetroClick'
  | 'sfxMetalPlace'
  | 'sfxMetalClear'
  | 'sfxMetalClick';

type SfxAssetKey = SoundType | GeneratedSfxKey;
type SoundAssetKey = SfxAssetKey | MusicTrackKey;

function getMusicVolumeMultiplier(musicPackId: string): number {
  if (musicPackId.startsWith('music_lofi')) return 0.78;
  if (musicPackId.startsWith('music_arcade')) return 1.08;
  if (musicPackId.startsWith('music_cave')) return 0.72;
  if (musicPackId.startsWith('music_space')) return 0.62;
  return 1;
}

function getSfxVolumeMultiplier(sfxPackId: string): number {
  if (sfxPackId.startsWith('sfx_glass')) return 0.92;
  if (sfxPackId.startsWith('sfx_retro')) return 1.05;
  if (sfxPackId.startsWith('sfx_metal')) return 1.12;
  if (sfxPackId.startsWith('sfx_wood')) return 0.98;
  return 1;
}

export function getMusicTrackKey(musicPackId: string): MusicTrackKey {
  if (musicPackId.startsWith('music_lofi')) return 'musicLofi';
  if (musicPackId.startsWith('music_arcade')) return 'musicArcade';
  if (musicPackId.startsWith('music_cave')) return 'musicCave';
  if (musicPackId.startsWith('music_space')) return 'musicSpace';
  return 'backgroundMusic';
}

export function mapSfxForPack(type: SoundType, sfxPackId: string): SfxAssetKey {
  if (sfxPackId.startsWith('sfx_glass')) {
    if (type === 'placeBlock') return 'sfxGlassPlace';
    if (type === 'breakLine' || type.startsWith('combo')) return 'sfxGlassClear';
    if (type === 'menuClick' || type === 'buttonHover' || type === 'invalidPlacement') return 'sfxGlassClick';
    if (type === 'gameOver') return 'sfxGlassClear';
  } else if (sfxPackId.startsWith('sfx_retro')) {
    if (type === 'placeBlock') return 'sfxRetroPlace';
    if (type === 'breakLine' || type.startsWith('combo') || type === 'gameOver') return 'sfxRetroClear';
    if (type === 'menuClick' || type === 'buttonHover' || type === 'invalidPlacement') return 'sfxRetroClick';
  } else if (sfxPackId.startsWith('sfx_metal')) {
    if (type === 'placeBlock') return 'sfxMetalPlace';
    if (type === 'breakLine' || type.startsWith('combo') || type === 'gameOver') return 'sfxMetalClear';
    if (type === 'menuClick' || type === 'buttonHover' || type === 'invalidPlacement') return 'sfxMetalClick';
  } else if (sfxPackId.startsWith('sfx_wood')) {
    if (type === 'placeBlock') return 'sfxWoodPlace';
    if (type === 'breakLine' || type.startsWith('combo') || type === 'gameOver') return 'sfxWoodClear';
    if (type === 'menuClick' || type === 'buttonHover' || type === 'invalidPlacement') return 'sfxWoodClick';
  }
  return type;
}

// Статичные импорты звуков вместо динамических
// В React Native require() требует статических путей
// Мы будем использовать функцию, которая выбирает правильный ресурс по имени
const getSoundResource = (type: SoundAssetKey) => {
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

// Network check for custom urls
import * as Network from 'expo-network';

async function hasInternetConnection(): Promise<boolean> {
  try {
    const networkState = await Network.getNetworkStateAsync();
    return !!networkState.isConnected && networkState.isInternetReachable !== false;
  } catch {
    return false;
  }
}

// Класс для управления звуковыми эффектами
class SoundManager {
  private sounds: Map<string, AudioPlayer> = new Map();
  private musicTracks: Map<MusicTrackKey, AudioPlayer> = new Map();
  private currentMusicKey: MusicTrackKey = 'backgroundMusic';
  private musicPlaying = false;
  private customMusicUrl: string | null = null;
  private initialized = false;

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
  private async loadSoundSafely(key: SfxAssetKey): Promise<void> {
    try {
      const soundResource = getSoundResource(key);
      if (!soundResource) {
        console.log(`Resource not found for sound "${key}"`);
        return;
      }

      const sound = createAudioPlayer(soundResource);
      if (sound) {
        this.sounds.set(key, sound);
      }
    } catch (error) {
      console.log(`Error loading sound "${key}": ${error}`);
    }
  }

  private async loadMusicSafely(key: MusicTrackKey): Promise<void> {
    try {
      const soundResource = getSoundResource(key);
      if (!soundResource) {
        console.log(`Resource not found for music "${key}"`);
        return;
      }

      const music = createAudioPlayer(soundResource);
      if (music) {
        music.loop = true;
        this.musicTracks.set(key, music);
      }
    } catch (error) {
      console.log(`Error loading music "${key}": ${error}`);
    }
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
  async initialize() {
    if (this.initialized) return;

    try {
      await setAudioModeAsync(getAudioModeOptions()).catch(err => console.log('Error setting audio mode:', err));

      // Load all sound effects with safe loading
      const sfxKeys: SfxAssetKey[] = [
        'placeBlock',
        'breakLine',
        'comboBreak',
        'comboX2',
        'comboX3',
        'comboX4',
        'comboX5',
        'gameOver',
        'menuClick',
        'invalidPlacement',
        'buttonHover',
        'sfxWoodPlace',
        'sfxWoodClear',
        'sfxWoodClick',
        'sfxGlassPlace',
        'sfxGlassClear',
        'sfxGlassClick',
        'sfxRetroPlace',
        'sfxRetroClear',
        'sfxRetroClick',
        'sfxMetalPlace',
        'sfxMetalClear',
        'sfxMetalClick',
      ];
      const soundPromises = sfxKeys.map(key => this.loadSoundSafely(key));

      await Promise.all(soundPromises);

      const musicKeys: MusicTrackKey[] = [
        'backgroundMusic',
        'musicLofi',
        'musicArcade',
        'musicCave',
        'musicSpace',
      ];
      const musicPromises = musicKeys.map(key => this.loadMusicSafely(key));

      await Promise.all(musicPromises);

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
        console.log('Sound system not initialized, skipping playback', type);
        return;
      }
      
      if (sfxPackId === 'sfx_custom') {
        const customUrl = await AsyncStorage.getItem("CUSTOM_SFX_URL");
        if (customUrl) {
          const hasNet = await hasInternetConnection();
          if (hasNet) {
            const customSound = createAudioPlayer(customUrl);
            customSound.volume = volume ?? 1;
            customSound.play();
            return;
          } else {
            console.log("No internet for custom SFX, falling back to default");
          }
        }
      }

      const sound = this.sounds.get(type);
      if (sound) {
        sound.volume = volume ?? 1;
        sound.seekTo(0);
        sound.play();
      } else {
        console.log('Sound not found:', type);
      }
    } catch (error) {
      console.error(`Error playing sound ${type}:`, error);
    }
  }

  // Воспроизведение фоновой музыки
  async playMusic(volume?: number, musicPackId: string = 'music_classic') {
    try {
      if (!this.initialized) {
        console.log('Background music not initialized, skipping playback');
        return;
      }

      if (musicPackId === 'music_custom') {
        const customUrl = await AsyncStorage.getItem("CUSTOM_MUSIC_URL");
        if (customUrl) {
          const hasNet = await hasInternetConnection();
          if (hasNet) {
            const customKey: MusicTrackKey = 'musicCustom';
            let customMusic = this.musicTracks.get(customKey);
            if (!customMusic || this.customMusicUrl !== customUrl) {
              customMusic?.pause();
              customMusic = createAudioPlayer(customUrl);
              customMusic.loop = true;
              this.musicTracks.set(customKey, customMusic);
              this.customMusicUrl = customUrl;
              this.musicPlaying = false;
            }

            if (this.currentMusicKey !== customKey) {
              this.pauseMusicTracksExcept(customKey);
              this.currentMusicKey = customKey;
              this.musicPlaying = false;
            }

            customMusic.volume = volume ?? 1;
            if (!this.musicPlaying) {
              customMusic.play();
              this.musicPlaying = true;
            }
            return;
          } else {
            console.log("No internet for custom music, falling back to classic");
            musicPackId = 'music_classic'; // Fallback
          }
        } else {
          musicPackId = 'music_classic'; // Fallback
        }
      }

      const musicKey = getMusicTrackKey(musicPackId);
      const nextMusic = this.musicTracks.get(musicKey);
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
export function useSoundSettings() {
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
    
    if (settings.musicEnabled) {
      await soundManager.playMusic(settings.musicVolume * getMusicVolumeMultiplier(musicPackId), musicPackId);
    }
  };

  useEffect(() => {
    if (musicEnabled) {
      soundManager.playMusic(musicVolume * getMusicVolumeMultiplier(musicPackId), musicPackId);
    } else {
      soundManager.pauseMusic();
    }
  }, [musicEnabled, musicPackId, musicVolume]);

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
