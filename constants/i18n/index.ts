// Aggregates per-screen translation modules so screens can be translated
// independently without touching one shared dictionary file.
import type { Language } from "@/constants/Localization";
import { mainmenu } from "./mainmenu";
import { shop } from "./shop";
import { achievements } from "./achievements";
import { multiplayer } from "./multiplayer";
import { challenges } from "./challenges";
import { highscores } from "./highscores";
import { profile } from "./profile";
import { gameover } from "./gameover";
import { friends } from "./friends";
import { hud } from "./hud";
import { moregames } from "./moregames";

export type ScreenDictionary = { en: Record<string, string>; ru: Record<string, string> };

const modules: ScreenDictionary[] = [
	mainmenu,
	shop,
	achievements,
	multiplayer,
	challenges,
	highscores,
	profile,
	gameover,
	friends,
	hud,
	moregames,
];

export const moduleTranslations: Record<Language, Record<string, string>> = {
	en: Object.assign({}, ...modules.map((module) => module.en)),
	ru: Object.assign({}, ...modules.map((module) => module.ru)),
};
