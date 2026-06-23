import { atom, useAtom } from "jotai";
import { useCallback } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { moduleTranslations } from "./i18n";

export type Language = "en" | "ru";

export const LANGUAGE_KEY = "APP_LANGUAGE";
export const SUPPORTED_LANGUAGES: Language[] = ["en", "ru"];
export const DEFAULT_LANGUAGE: Language = "en";

export const LANGUAGE_LABELS: Record<Language, string> = {
	en: "English",
	ru: "Русский",
};

export function normalizeLanguage(value: string | null | undefined): Language {
	return value === "ru" ? "ru" : "en";
}

// Reads the saved language synchronously-ish at startup so font loading can pick a
// Cyrillic-capable face. Returns DEFAULT_LANGUAGE when nothing is stored yet.
export async function loadStoredLanguage(): Promise<Language> {
	try {
		return normalizeLanguage(await AsyncStorage.getItem(LANGUAGE_KEY));
	} catch {
		return DEFAULT_LANGUAGE;
	}
}

type Dictionary = Record<string, string>;

const en: Dictionary = {
	"common.on": "On",
	"common.off": "Off",
	"common.back": "Back",
	"common.save": "Save",
	"common.play": "Play",
	"common.host": "Host",
	"common.join": "Join",
	"common.leave": "Leave",
	"common.refresh": "Refresh",
	"common.coins": "Coins",

	// Settings
	"settings.title": "Settings",
	"settings.sound": "Sound",
	"settings.theme": "Theme",
	"settings.language": "Language",
	"settings.languageDesc": "Menu and game text language",

	// Sudoku
	"sudoku.solved": "Solved",
	"sudoku.gameOver": "Game Over",
	"sudoku.mistakes": "Mistakes",
	"sudoku.selectCell": "Select a cell",
	"sudoku.notes": "Notes",
	"sudoku.cleanBoard": "Clean board, well played",
	"sudoku.restart": "Restart",
	"sudoku.newGame": "New Game",
	"sudoku.clear": "Clear",

	// Mahjong
	"mahjong.tilesLeft": "{count} tiles left",
	"mahjong.boardCleared": "Board cleared",
	"mahjong.noMoves": "No moves left — shuffle or start a new board",
	"mahjong.undo": "Undo",
	"mahjong.shuffle": "Shuffle",
	"mahjong.new": "New",

	// Durak
	"durak.yourBet": "Your bet",
	"durak.players": "Players",
	"durak.deck": "Deck",
	"durak.modes": "Game modes",
	"durak.modeThrowIn": "Throw-in",
	"durak.modeTransfer": "Transfer",
	"durak.modeCheat": "Cheat",
	"durak.create": "Create",
	"durak.balance": "Balance",
	"durak.notEnough": "Not enough coins for this bet",
	"durak.pot": "Pot",
	"durak.prize": "1st place prize",
	"durak.hostDeals": "Host deals the deck",
	"durak.trump": "Trump",
	"durak.pass": "Pass",
	"durak.take": "Take",
	"durak.emoji": "Emoji",
	"durak.wins": "{seat} wins",
	"durak.youWon": "You won +{amount}",
	"durak.youLost": "You lost {amount}",
	"durak.deckLabel": "Deck {deck} | Discard {discard}",
	"durak.bank": "Bet {bet} | Pot {pot} | 1st place +{prize}",
};

const ru: Dictionary = {
	"common.on": "Вкл",
	"common.off": "Выкл",
	"common.back": "Назад",
	"common.save": "Сохранить",
	"common.play": "Играть",
	"common.host": "Создать",
	"common.join": "Войти",
	"common.leave": "Выйти",
	"common.refresh": "Обновить",
	"common.coins": "Монеты",

	// Settings
	"settings.title": "Настройки",
	"settings.sound": "Звук",
	"settings.theme": "Тема",
	"settings.language": "Язык",
	"settings.languageDesc": "Язык меню и текста в играх",

	// Sudoku
	"sudoku.solved": "Решено",
	"sudoku.gameOver": "Игра окончена",
	"sudoku.mistakes": "Ошибки",
	"sudoku.selectCell": "Выберите клетку",
	"sudoku.notes": "Заметки",
	"sudoku.cleanBoard": "Чистая доска, отлично",
	"sudoku.restart": "Заново",
	"sudoku.newGame": "Новая игра",
	"sudoku.clear": "Стереть",

	// Mahjong
	"mahjong.tilesLeft": "Осталось плиток: {count}",
	"mahjong.boardCleared": "Доска очищена",
	"mahjong.noMoves": "Нет ходов — перемешайте или начните заново",
	"mahjong.undo": "Отмена",
	"mahjong.shuffle": "Перемешать",
	"mahjong.new": "Новая",

	// Durak
	"durak.yourBet": "Ваша ставка",
	"durak.players": "Игроки",
	"durak.deck": "Колода",
	"durak.modes": "Режимы игры",
	"durak.modeThrowIn": "Подкидной",
	"durak.modeTransfer": "Переводной",
	"durak.modeCheat": "С шулерами",
	"durak.create": "Создать",
	"durak.balance": "Баланс",
	"durak.notEnough": "Недостаточно монет для ставки",
	"durak.pot": "Банк",
	"durak.prize": "Приз за 1 место",
	"durak.hostDeals": "Хост раздаёт колоду",
	"durak.trump": "Козырь",
	"durak.pass": "Бито",
	"durak.take": "Беру",
	"durak.emoji": "Эмодзи",
	"durak.wins": "{seat} победил",
	"durak.youWon": "Вы выиграли +{amount}",
	"durak.youLost": "Вы проиграли {amount}",
	"durak.deckLabel": "Колода {deck} | Отбой {discard}",
	"durak.bank": "Ставка {bet} | Банк {pot} | 1 место +{prize}",
};

export const translations: Record<Language, Dictionary> = {
	en: { ...en, ...moduleTranslations.en },
	ru: { ...ru, ...moduleTranslations.ru },
};

export type TranslateVars = Record<string, string | number>;

export function translate(language: Language, key: string, vars?: TranslateVars): string {
	let value = translations[language][key] ?? translations.en[key] ?? key;
	if (vars) {
		for (const name of Object.keys(vars)) {
			value = value.split(`{${name}}`).join(String(vars[name]));
		}
	}
	return value;
}

export const languageAtom = atom<Language>(DEFAULT_LANGUAGE);

function reloadAppForFont() {
	// The pixel font family is chosen at startup based on the saved language, so a
	// reload is needed to swap Latin (Silkscreen) <-> Cyrillic (Pixelify) glyphs.
	if (Platform.OS === "web") {
		if (typeof window !== "undefined" && window.location) {
			window.location.reload();
		}
		return;
	}
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const Updates = require("expo-updates");
		if (Updates?.reloadAsync) {
			void Updates.reloadAsync().catch(() => undefined);
		}
	} catch {
		// Reload not available (e.g. dev client) — strings switch immediately and the
		// font updates on the next app launch.
	}
}

export function useLanguage() {
	const [language, setLanguage] = useAtom(languageAtom);

	const t = useCallback(
		(key: string, vars?: TranslateVars) => translate(language, key, vars),
		[language],
	);

	const changeLanguage = useCallback(async (next: Language, options?: { reload?: boolean }) => {
		const normalized = normalizeLanguage(next);
		setLanguage(normalized);
		try {
			await AsyncStorage.setItem(LANGUAGE_KEY, normalized);
		} catch {}
		if (options?.reload !== false) {
			reloadAppForFont();
		}
	}, [setLanguage]);

	const loadLanguage = useCallback(async () => {
		const stored = await loadStoredLanguage();
		setLanguage(stored);
		return stored;
	}, [setLanguage]);

	return { language, t, changeLanguage, loadLanguage };
}
