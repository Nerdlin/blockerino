import { Color } from './Color';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { atom, useAtom } from 'jotai';

// Ключ для хранения выбранной темы
const SELECTED_THEME_KEY = 'SELECTED_THEME';

// Типы тем
export enum ThemeType {
  CLASSIC = 'classic',
  NEON = 'neon',
  DARK = 'dark',
  RETRO = 'retro',
  BLUE = 'blue' // Новая тема
}

// Интерфейс для темы
export interface Theme {
  id: ThemeType;
  name: string;
  background: string;
  gridBackground: string;
  gridBorder: string;
  emptyBlockBorder: string;
  menuBackground: string;
  textPrimary: string;
  textSecondary: string;
  buttonPrimary: string;
  buttonSecondary: string;
  accent: string;
  pieceColors: Color[];
}

// Определение тем
export const themes: Record<ThemeType, Theme> = {
  [ThemeType.CLASSIC]: {
    id: ThemeType.CLASSIC,
    name: 'Classic',
    background: 'rgba(0, 0, 0, 0.4)',
    gridBackground: 'rgb(0, 0, 0, 1)',
    gridBorder: 'rgb(255, 255, 255)',
    emptyBlockBorder: 'rgb(40, 40, 40)',
    menuBackground: 'rgba(5, 5, 5, 0.95)',
    textPrimary: 'white',
    textSecondary: 'rgb(150, 150, 150)',
    buttonPrimary: '#FF3333',
    buttonSecondary: 'rgb(90, 90, 90)',
    accent: 'rgb(240, 175, 12)',
    pieceColors: [
      { r: 227, g: 143, b: 16 },
      { r: 186, g: 19, b: 38 },
      { r: 16, g: 158, b: 40 },
      { r: 20, g: 56, b: 184 },
      { r: 101, g: 19, b: 148 },
      { r: 31, g: 165, b: 222 }
    ]
  },
  [ThemeType.NEON]: {
    id: ThemeType.NEON,
    name: 'Neon',
    background: 'rgba(0, 0, 20, 0.8)',
    gridBackground: 'rgb(5, 5, 20)',
    gridBorder: 'rgb(0, 230, 255)',
    emptyBlockBorder: 'rgb(30, 30, 60)',
    menuBackground: 'rgba(10, 10, 30, 0.95)',
    textPrimary: 'rgb(0, 255, 200)',
    textSecondary: 'rgb(100, 100, 255)',
    buttonPrimary: 'rgb(255, 0, 230)',
    buttonSecondary: 'rgb(0, 150, 255)',
    accent: 'rgb(255, 255, 0)',
    pieceColors: [
      { r: 255, g: 0, b: 128 },
      { r: 0, g: 255, b: 255 },
      { r: 255, g: 255, b: 0 },
      { r: 0, g: 255, b: 128 },
      { r: 255, g: 0, b: 255 },
      { r: 128, g: 0, b: 255 }
    ]
  },
  [ThemeType.DARK]: {
    id: ThemeType.DARK,
    name: 'Dark',
    background: 'rgb(15, 15, 15)',
    gridBackground: 'rgb(25, 25, 25)',
    gridBorder: 'rgb(60, 60, 60)',
    emptyBlockBorder: 'rgb(40, 40, 40)',
    menuBackground: 'rgba(30, 30, 30, 0.95)',
    textPrimary: 'rgb(200, 200, 200)',
    textSecondary: 'rgb(120, 120, 120)',
    buttonPrimary: 'rgb(70, 70, 70)',
    buttonSecondary: 'rgb(50, 50, 50)',
    accent: 'rgb(100, 100, 100)',
    pieceColors: [
      { r: 100, g: 100, b: 100 },
      { r: 120, g: 120, b: 120 },
      { r: 140, g: 140, b: 140 },
      { r: 160, g: 160, b: 160 },
      { r: 180, g: 180, b: 180 },
      { r: 200, g: 200, b: 200 }
    ]
  },
  [ThemeType.RETRO]: {
    id: ThemeType.RETRO,
    name: 'Retro',
    background: 'rgb(20, 43, 35)',
    gridBackground: 'rgb(15, 56, 15)',
    gridBorder: 'rgb(65, 108, 80)',
    emptyBlockBorder: 'rgb(40, 76, 48)',
    menuBackground: 'rgba(30, 62, 46, 0.95)',
    textPrimary: 'rgb(170, 255, 170)',
    textSecondary: 'rgb(100, 180, 100)',
    buttonPrimary: 'rgb(80, 160, 80)',
    buttonSecondary: 'rgb(60, 120, 60)',
    accent: 'rgb(255, 255, 150)',
    pieceColors: [
      { r: 170, g: 255, b: 170 },
      { r: 100, g: 180, b: 100 },
      { r: 80, g: 160, b: 80 },
      { r: 60, g: 120, b: 60 },
      { r: 40, g: 100, b: 40 },
      { r: 30, g: 80, b: 30 }
    ]
  },
  [ThemeType.BLUE]: {
    id: ThemeType.BLUE,
    name: 'Blue',
    background: 'rgb(0, 102, 204)',
    gridBackground: 'rgb(0, 76, 153)',
    gridBorder: 'rgb(0, 51, 102)',
    emptyBlockBorder: 'rgb(0, 51, 102)',
    menuBackground: 'rgb(0, 102, 204)',
    textPrimary: 'white',
    textSecondary: 'rgb(200, 200, 255)',
    buttonPrimary: 'rgb(0, 153, 51)',
    buttonSecondary: 'rgb(0, 102, 204)',
    accent: 'rgb(255, 204, 0)',
    pieceColors: [
      { r: 255, g: 255, b: 255 },
      { r: 255, g: 204, b: 0 },
      { r: 0, g: 153, b: 51 },
      { r: 0, g: 102, b: 204 },
      { r: 255, g: 0, b: 0 },
      { r: 153, g: 51, b: 255 }
    ]
  }
};

// Атом для хранения текущей темы
export const currentThemeAtom = atom<Theme>(themes[ThemeType.CLASSIC]);

// Хук для управления темами
export function useTheme() {
  const [currentTheme, setCurrentTheme] = useAtom(currentThemeAtom);

  const changeTheme = async (themeType: ThemeType) => {
    setCurrentTheme(themes[themeType]);
    try {
      await AsyncStorage.setItem(SELECTED_THEME_KEY, themeType);
    } catch (error) {
      console.error('Ошибка при сохранении темы:', error);
    }
  };

  const loadTheme = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem(SELECTED_THEME_KEY);
      if (savedTheme && Object.values(ThemeType).includes(savedTheme as ThemeType)) {
        setCurrentTheme(themes[savedTheme as ThemeType]);
      }
    } catch (error) {
      console.error('Ошибка при загрузке темы:', error);
    }
  };

  return {
    currentTheme,
    changeTheme,
    loadTheme,
    availableThemes: Object.values(themes)
  };
}
