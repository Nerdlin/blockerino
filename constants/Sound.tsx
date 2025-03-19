import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { atom, useAtom } from 'jotai';

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

// Статичные импорты звуков вместо динамических
// В React Native require() требует статических путей
// Мы будем использовать функцию, которая выбирает правильный ресурс по имени
const getSoundResource = (type: string) => {
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
    default:
      return null;
  }
};

// Класс для управления звуковыми эффектами
class SoundManager {
  private sounds: Map<string, Audio.Sound> = new Map();
  private backgroundMusic?: Audio.Sound;
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
  private async loadSoundSafely(key: string): Promise<void> {
    try {
      const soundResource = getSoundResource(key);
      if (!soundResource) {
        console.log(`Resource not found for sound "${key}"`);
        return;
      }

      const sound = new Audio.Sound();
      await sound.loadAsync(soundResource)
        .catch(err => {
          console.log(`Failed to load sound "${key}": ${err.message}`);
          return null;
        });
      if (sound) {
        this.sounds.set(key, sound);
      }
    } catch (error) {
      console.log(`Error loading sound "${key}": ${error}`);
    }
  }

  // Инициализация звуков
  async initialize() {
    if (this.initialized) return;

    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      }).catch(err => console.log('Error setting audio mode:', err));

      // Load all sound effects with safe loading
      const soundPromises = [
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
        'buttonHover'
      ].map(key => this.loadSoundSafely(key));

      await Promise.all(soundPromises);

      // Load background music separately
      try {
        const bgMusicResource = getSoundResource('backgroundMusic');
        if (bgMusicResource) {
          this.backgroundMusic = new Audio.Sound();
          await this.backgroundMusic.loadAsync(bgMusicResource)
            .catch(() => {
              console.log('Failed to load background music');
              this.backgroundMusic = undefined;
            });
          
          if (this.backgroundMusic) {
            await this.backgroundMusic.setIsLoopingAsync(true)
              .catch(() => console.log('Failed to set background music looping'));
          }
        }
      } catch (error) {
        console.log(`Error loading background music: ${error}`);
        this.backgroundMusic = undefined;
      }

      this.initialized = true;
    } catch (error) {
      console.error('Error initializing sounds:', error);
    }
  }

  // Get appropriate combo sound based on combo count
  getComboSound(comboCount: number): string {
    if (comboCount >= 5) return 'comboX5';
    if (comboCount >= 4) return 'comboX4';
    if (comboCount >= 3) return 'comboX3';
    if (comboCount >= 2) return 'comboX2';
    return 'comboBreak';
  }

  // Воспроизведение звукового эффекта
  async playSfx(type: SoundType, volume?: number) {
    try {
      if (!this.initialized) {
        console.log('Sound system not initialized, skipping playback', type);
        return;
      }
      
      const sound = this.sounds.get(type);
      if (sound) {
        await sound.setVolumeAsync(volume ?? 1).catch(() => {});
        await sound.replayAsync().catch(() => {});
      } else {
        console.log('Sound not found:', type);
      }
    } catch (error) {
      console.error(`Error playing sound ${type}:`, error);
    }
  }

  // Воспроизведение фоновой музыки
  async playMusic(volume?: number) {
    try {
      if (!this.initialized || !this.backgroundMusic) {
        console.log('Background music not initialized, skipping playback');
        return;
      }
      
      await this.backgroundMusic.setVolumeAsync(volume ?? 1).catch(() => {});
      await this.backgroundMusic.playAsync().catch(() => {});
    } catch (error) {
      console.error('Error playing background music:', error);
    }
  }

  // Остановка фоновой музыки
  async stopMusic() {
    try {
      if (this.backgroundMusic) {
        await this.backgroundMusic.stopAsync().catch(() => {});
      }
    } catch (error) {
      console.error('Error stopping background music:', error);
    }
  }

  // Пауза фоновой музыки
  async pauseMusic() {
    try {
      if (this.backgroundMusic) {
        await this.backgroundMusic.pauseAsync().catch(() => {});
      }
    } catch (error) {
      console.error('Error pausing background music:', error);
    }
  }

  // Обновление громкости фоновой музыки
  async updateMusicVolume(volume: number) {
    try {
      if (this.backgroundMusic) {
        await this.backgroundMusic.setVolumeAsync(volume).catch(() => {});
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

  const updateMusicVolume = async (volume: number) => {
    setMusicVolume(volume);
    await soundManager.saveSettings({ musicVolume: volume });
    await soundManager.updateMusicVolume(musicEnabled ? volume : 0);
  };

  const updateSfxVolume = async (volume: number) => {
    setSfxVolume(volume);
    await soundManager.saveSettings({ sfxVolume: volume });
  };

  const toggleMusic = async (enabled: boolean) => {
    setMusicEnabled(enabled);
    await soundManager.saveSettings({ musicEnabled: enabled });
    
    if (enabled) {
      await soundManager.playMusic(musicVolume);
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
      await soundManager.playSfx(type, sfxVolume);
    }
  };

  // Play combo sound based on combo count
  const playComboSound = async (comboCount: number) => {
    if (sfxEnabled) {
      const soundType = soundManager.getComboSound(comboCount) as SoundType;
      await soundManager.playSfx(soundType, sfxVolume);
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
      await soundManager.playMusic(settings.musicVolume);
    }
  };

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
