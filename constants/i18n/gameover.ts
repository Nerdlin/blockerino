import type { ScreenDictionary } from "./index";

export const gameover: ScreenDictionary = {
	en: {
		// GameOverModal
		"over.gameOver": "Game Over",
		"over.yourScore": "Your Score",
		"over.coinsAwarded": "+{coins} shop coins",
		"over.enterNickname": "Enter a nickname to save your score!",
		"over.nicknamePlaceholder": "Your Nickname",
		"over.saveScore": "Save Score",
		"over.saving": "Saving score to global leaderboard...",
		"over.saved": "Score saved under \"{name}\"!",
		"over.savedOffline": "Score saved offline. It will sync when internet returns.",
		"over.syncFailed": "Could not sync score to leaderboard.",
		"over.needName": "Enter a nickname first.",
		"over.playAgain": "Play Again",
		"over.mainMenu": "Main Menu",

		// ContinueGameModal
		"over.unfinishedGame": "Unfinished Game",
		"over.savedGame": "You have a saved game!",
		"over.mode": "Mode:",
		"over.score": "Score:",
		"over.continue": "Continue",
		"over.startOver": "Start Over",

		// SecondChanceModal
		"over.extraChance": "Extra Chance?",
		"over.seconds": "{seconds}s",
		"over.timeRanOut": "Time ran out.",
		"over.noMovesLeft": "No moves left.",
		"over.costPoints": "-{cost} points",
		"over.notEnoughPoints": "Not enough points!",
		"over.chancesLeft": "Chances left: {count}",
		"over.no": "No",

		// OfflinePlayPrompt
		"over.noInternet": "No Internet",
		"over.offlineMessage": "{mode} can run offline. Your score will be saved and synced to the global leaderboard when internet returns.",
		"over.continueOffline": "Continue Offline",
		"over.back": "Back",
	},
	ru: {
		// GameOverModal
		"over.gameOver": "Игра окончена",
		"over.yourScore": "Очки",
		"over.coinsAwarded": "+{coins} монет",
		"over.enterNickname": "Введите ник, чтобы сохранить результат!",
		"over.nicknamePlaceholder": "Ваш ник",
		"over.saveScore": "Сохранить",
		"over.saving": "Сохранение в таблицу лидеров...",
		"over.saved": "Результат сохранён как \"{name}\"!",
		"over.savedOffline": "Сохранено офлайн. Синхронизируется при подключении.",
		"over.syncFailed": "Не удалось синхронизировать результат.",
		"over.needName": "Сначала введите ник.",
		"over.playAgain": "Ещё раз",
		"over.mainMenu": "Меню",

		// ContinueGameModal
		"over.unfinishedGame": "Незаконченная игра",
		"over.savedGame": "У вас есть сохранённая игра!",
		"over.mode": "Режим:",
		"over.score": "Очки:",
		"over.continue": "Продолжить",
		"over.startOver": "Начать заново",

		// SecondChanceModal
		"over.extraChance": "Ещё попытка?",
		"over.seconds": "{seconds}с",
		"over.timeRanOut": "Время вышло.",
		"over.noMovesLeft": "Нет ходов.",
		"over.costPoints": "-{cost} очков",
		"over.notEnoughPoints": "Недостаточно очков!",
		"over.chancesLeft": "Попыток осталось: {count}",
		"over.no": "Нет",

		// OfflinePlayPrompt
		"over.noInternet": "Нет интернета",
		"over.offlineMessage": "{mode} работает офлайн. Результат сохранится и синхронизируется при подключении.",
		"over.continueOffline": "Играть офлайн",
		"over.back": "Назад",
	},
};
