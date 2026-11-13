import type { ScreenDictionary } from "./index";

export const goals: ScreenDictionary = {
	en: {
		// the goal line above the board
		"goals.bronze": "Bronze",
		"goals.silver": "Silver",
		"goals.gold": "Gold",
		"goals.record": "Your record",
		"goals.friend": "Beat {name}",
		"goals.left": "{points} to go",
		"goals.done": "All goals beaten!",
		// the flash when a goal is passed
		"goals.passed.bronze": "BRONZE!",
		"goals.passed.silver": "SILVER!",
		"goals.passed.gold": "GOLD!",
		"goals.passed.record": "NEW RECORD!",
		"goals.passed.friend": "{name} BEATEN!",
		// game over
		"goals.medalEarned": "{medal} medal  +{coins}",
		"goals.toNextMedal": "{points} to {medal}",
		"goals.danger": "Running out of room!",
	},
	ru: {
		"goals.bronze": "Бронза",
		"goals.silver": "Серебро",
		"goals.gold": "Золото",
		"goals.record": "Твой рекорд",
		"goals.friend": "Обгони {name}",
		"goals.left": "ещё {points}",
		"goals.done": "Все цели взяты!",
		"goals.passed.bronze": "БРОНЗА!",
		"goals.passed.silver": "СЕРЕБРО!",
		"goals.passed.gold": "ЗОЛОТО!",
		"goals.passed.record": "НОВЫЙ РЕКОРД!",
		"goals.passed.friend": "{name} ПОЗАДИ!",
		"goals.medalEarned": "Медаль: {medal}  +{coins}",
		"goals.toNextMedal": "До медали «{medal}»: {points}",
		"goals.danger": "Места почти нет!",
	},
};
