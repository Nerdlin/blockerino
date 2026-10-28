import type { BotLook } from "./BotSprites";

// The chess bots: named characters with a fixed Elo (like chess.com's "Martinfoot 250"), unlocked one after another
// by beating the previous one. Echo is the adaptive bot: its Elo follows the player's rating instead of being fixed.

export type BotTier = "new" | "beginner" | "intermediate" | "strong";
export type BotVoice = "shy" | "cheerful" | "sly" | "calm";
export type Lang = "en" | "ru";
export type Localized = Record<Lang, string>;

export interface ChessBotProfile {
	look: BotLook;
	id: string;
	name: string;
	elo: number;
	tier: BotTier;
	/** Pixel avatar colour. */
	color: string;
	voice: BotVoice;
	greeting: Localized;
}

export const ADAPTIVE_BOT_ID = "echo";

export const CHESS_BOTS: ChessBotProfile[] = [
	{ id: "pip", name: "Pip", elo: 400, tier: "new", color: "#FFC400", look: { skin: "#F2C9A0", hair: "short", hairColor: "#8B5A2B", shirt: "#FFC400", accessory: "cap", accent: "#FFC400", mouth: "smile" }, voice: "shy", greeting: { en: "Hi! I just learned how the knight moves.", ru: "Привет! Я только выучил, как ходит конь." } },
	{ id: "dot", name: "Dot", elo: 500, tier: "new", color: "#FF8A3C", look: { skin: "#F7D6B5", hair: "bob", hairColor: "#2B2B3C", shirt: "#FF8A3C", accessory: "freckles", accent: "#FF8A3C", mouth: "flat" }, voice: "shy", greeting: { en: "Be gentle, okay?", ru: "Только не слишком строго, ладно?" } },
	{ id: "nibble", name: "Nibble", elo: 650, tier: "new", color: "#FF5A7A", look: { skin: "#E8B98F", hair: "curly", hairColor: "#C8501E", shirt: "#FF5A7A", accessory: "none", accent: "#FF5A7A", mouth: "open" }, voice: "cheerful", greeting: { en: "Yum! Is that a pawn I see?", ru: "Ням! Это пешка?" } },
	{ id: "tilt", name: "Tilt", elo: 800, tier: "beginner", color: "#4AC0FF", look: { skin: "#D9A57A", hair: "spiky", hairColor: "#2B2B3C", shirt: "#4AC0FF", accessory: "headband", accent: "#4AC0FF", mouth: "smile" }, voice: "cheerful", greeting: { en: "Fast moves, big plans!", ru: "Быстрые ходы, большие планы!" } },
	{ id: "roxy", name: "Roxy", elo: 950, tier: "beginner", color: "#4A8AFF", look: { skin: "#F2C9A0", hair: "ponytail", hairColor: "#3B2A20", shirt: "#4A8AFF", accessory: "scarf", accent: "#4A8AFF", mouth: "smile" }, voice: "cheerful", greeting: { en: "Open files are my favorite.", ru: "Обожаю открытые линии." } },
	{ id: "glitch", name: "Glitch", elo: 1100, tier: "beginner", color: "#7B3FE4", look: { skin: "#9AD0C2", hair: "short", hairColor: "#7B3FE4", shirt: "#7B3FE4", accessory: "glasses", accent: "#101018", mouth: "flat" }, voice: "sly", greeting: { en: "Expect the unexpected.", ru: "Жди неожиданного." } },
	{ id: "bob", name: "Bob", elo: 1200, tier: "intermediate", color: "#2E9E4F", look: { skin: "#E8B98F", hair: "bald", hairColor: "#5A3A22", shirt: "#2E9E4F", accessory: "mustache", accent: "#2E9E4F", mouth: "smile" }, voice: "calm", greeting: { en: "Bishops forever. Let's play.", ru: "Слоны навсегда. Играем." } },
	{ id: "quill", name: "Quill", elo: 1300, tier: "intermediate", color: "#C77DFF", look: { skin: "#F2C9A0", hair: "long", hairColor: "#C77DFF", shirt: "#C77DFF", accessory: "glasses", accent: "#6B3FA0", mouth: "flat" }, voice: "calm", greeting: { en: "I see two moves ahead. Do you?", ru: "Я вижу на два хода вперёд. А ты?" } },
	{ id: "knox", name: "Knox", elo: 1400, tier: "intermediate", color: "#9AA3B5", look: { skin: "#C98D63", hair: "short", hairColor: "#2B2B3C", shirt: "#9AA3B5", accessory: "helm", accent: "#9AA3B5", mouth: "flat" }, voice: "calm", greeting: { en: "Solid and steady.", ru: "Надёжно и спокойно." } },
	{ id: "vex", name: "Vex", elo: 1500, tier: "strong", color: "#FF3335", look: { skin: "#E0A98A", hair: "spiky", hairColor: "#101018", shirt: "#FF3335", accessory: "horns", accent: "#FF3335", mouth: "smile" }, voice: "sly", greeting: { en: "Your king looks nervous already.", ru: "Твой король уже нервничает." } },
];

export const ADAPTIVE_BOT: Omit<ChessBotProfile, "elo"> = {
	id: ADAPTIVE_BOT_ID,
	name: "Echo",
	tier: "intermediate",
	color: "#2EC4B6",
	look: { skin: "#BFEAE5", hair: "bald", hairColor: "#2EC4B6", shirt: "#2EC4B6", accessory: "antenna", accent: "#2EC4B6", mouth: "flat" } as BotLook,
	voice: "calm",
	greeting: { en: "I play at your level. Let's see who improves first.", ru: "Я играю на твоём уровне. Посмотрим, кто вырастет первым." },
};

export function getBot(id: string): ChessBotProfile | undefined {
	return CHESS_BOTS.find((bot) => bot.id === id);
}

/** The first bot is open; every other one opens when the previous bot in the list was beaten. */
export function isBotUnlocked(id: string, beaten: readonly string[]): boolean {
	const index = CHESS_BOTS.findIndex((bot) => bot.id === id);
	if (index < 0) return false;
	if (index === 0) return true;
	return beaten.includes(CHESS_BOTS[index - 1].id);
}

/** The next locked bot and how it opens; null when everything is open. */
export function nextBotToUnlock(beaten: readonly string[]): { bot: ChessBotProfile; mustBeat: ChessBotProfile } | null {
	for (let i = 1; i < CHESS_BOTS.length; i++) {
		if (!beaten.includes(CHESS_BOTS[i - 1].id)) return { bot: CHESS_BOTS[i], mustBeat: CHESS_BOTS[i - 1] };
	}
	return null;
}

const ADAPTIVE_MIN = 400;
const ADAPTIVE_MAX = 1500;

/**
 * Echo's Elo for the next game: the player's rating, nudged up after wins and down after losses of the last games
 * ("W", "L", "D", newest last), and kept inside what the engine can play.
 */
export function adaptiveBotElo(playerRating: number, recent: readonly ("W" | "L" | "D")[] = []): number {
	const last = recent.slice(-5);
	const form = last.reduce((sum, result) => sum + (result === "W" ? 1 : result === "L" ? -1 : 0), 0);
	const nudged = playerRating + form * 20;
	return Math.max(ADAPTIVE_MIN, Math.min(ADAPTIVE_MAX, Math.round(nudged / 10) * 10));
}

export type QuipKind = "greeting" | "playerMove" | "capture" | "check" | "botWins" | "botLoses" | "draw";

type VoiceLines = Record<Exclude<QuipKind, "greeting">, Localized[]>;

const VOICES: Record<BotVoice, VoiceLines> = {
	shy: {
		playerMove: [
			{ en: "Hmm, that looks smart...", ru: "Хм, выглядит умно..." },
			{ en: "Oh no, what are you planning?", ru: "Ой, что ты задумал?" },
		],
		capture: [{ en: "Oops, I think I lost something.", ru: "Ой, кажется, я что-то потерял." }],
		check: [{ en: "Eek! My king!", ru: "Ай! Мой король!" }],
		botWins: [{ en: "I won? Really? Thanks for playing!", ru: "Я выиграл? Правда? Спасибо за игру!" }],
		botLoses: [{ en: "Well played! I'll practice more.", ru: "Отлично сыграно! Буду тренироваться." }],
		draw: [{ en: "A draw! That's not bad for me.", ru: "Ничья! Для меня это неплохо." }],
	},
	cheerful: {
		playerMove: [
			{ en: "Nice move! Let me answer.", ru: "Хороший ход! Сейчас отвечу." },
			{ en: "Oh, I like where this is going.", ru: "О, мне нравится, куда это идёт." },
		],
		capture: [{ en: "Got one!", ru: "Одну забрал!" }],
		check: [{ en: "Whoa, check!", ru: "Ого, шах!" }],
		botWins: [{ en: "Good game! Want a rematch?", ru: "Хорошая игра! Реванш?" }],
		botLoses: [{ en: "You got me! Great game.", ru: "Ты меня обыграл! Отличная партия." }],
		draw: [{ en: "A draw, fair enough!", ru: "Ничья, честно!" }],
	},
	sly: {
		playerMove: [
			{ en: "Interesting. Very interesting.", ru: "Интересно. Очень интересно." },
			{ en: "You walked right into it.", ru: "Ты сам пришёл ко мне в руки." },
		],
		capture: [{ en: "Thank you for the gift.", ru: "Спасибо за подарок." }],
		check: [{ en: "Check. Run.", ru: "Шах. Беги." }],
		botWins: [{ en: "As planned.", ru: "Как и задумано." }],
		botLoses: [{ en: "Lucky. This time.", ru: "Повезло. В этот раз." }],
		draw: [{ en: "A draw. I'll take it.", ru: "Ничья. Беру." }],
	},
	calm: {
		playerMove: [
			{ en: "A reasonable move.", ru: "Разумный ход." },
			{ en: "Let me think about that.", ru: "Дай подумать." },
		],
		capture: [{ en: "A fair trade.", ru: "Честный размен." }],
		check: [{ en: "Check.", ru: "Шах." }],
		botWins: [{ en: "Good game. Study the endgame.", ru: "Хорошая игра. Поучи эндшпиль." }],
		botLoses: [{ en: "Well played. You earned it.", ru: "Хорошо сыграно. Заслуженно." }],
		draw: [{ en: "An even game.", ru: "Равная партия." }],
	},
};

/** A line for the speech bubble; `rng` picks among a few. Greeting is the bot's own line. */
export function botQuip(bot: Pick<ChessBotProfile, "voice" | "greeting">, kind: QuipKind, lang: Lang, rng: () => number = Math.random): string {
	if (kind === "greeting") return bot.greeting[lang];
	const lines = VOICES[bot.voice][kind];
	return lines[Math.min(lines.length - 1, Math.floor(rng() * lines.length))][lang];
}
