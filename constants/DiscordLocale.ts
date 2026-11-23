// Discord tells the Activity which language the player uses in Discord (e.g. "ru", "en-GB", "pt-BR"). The game has two
// languages; Rich Presence follows Discord's setting, not the game's, because it is shown to other people in Discord.

export type PresenceLang = "en" | "ru";

export function normalizeDiscordLocale(locale: unknown): PresenceLang {
	return typeof locale === "string" && /^ru(?:[-_]|$)/i.test(locale.trim()) ? "ru" : "en";
}

/** Russian plural form: 1 день, 2 дня, 5 дней, 11 дней, 21 день. */
export function ruPlural(n: number, one: string, few: string, many: string): string {
	const abs = Math.abs(Math.floor(n));
	const last = abs % 10;
	const lastTwo = abs % 100;
	if (lastTwo >= 11 && lastTwo <= 14) return many;
	if (last === 1) return one;
	if (last >= 2 && last <= 4) return few;
	return many;
}

/** 1240 -> "1,240" (English) / "1 240" (Russian, with a no-break space). */
export function formatNumber(n: number, lang: PresenceLang): string {
	const whole = String(Math.max(0, Math.floor(n)));
	return whole.replace(/\B(?=(\d{3})+(?!\d))/g, lang === "ru" ? " " : ",");
}
