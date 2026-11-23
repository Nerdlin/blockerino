import { formatNumber, normalizeDiscordLocale, ruPlural } from "./DiscordLocale";

describe("normalizeDiscordLocale", () => {
	it("picks Russian for Russian locales and English for everything else", () => {
		expect(normalizeDiscordLocale("ru")).toBe("ru");
		expect(normalizeDiscordLocale("ru-RU")).toBe("ru");
		expect(normalizeDiscordLocale("RU_ru")).toBe("ru");
		expect(normalizeDiscordLocale("en-US")).toBe("en");
		expect(normalizeDiscordLocale("pt-BR")).toBe("en");
		expect(normalizeDiscordLocale("")).toBe("en");
		expect(normalizeDiscordLocale(undefined)).toBe("en");
		expect(normalizeDiscordLocale("rus-xx")).toBe("en");
	});
});

describe("ruPlural", () => {
	it("follows Russian rules", () => {
		const word = (n: number) => ruPlural(n, "день", "дня", "дней");
		expect([1, 2, 5, 11, 12, 21, 22, 25, 111].map(word)).toEqual(["день", "дня", "дней", "дней", "дней", "день", "дня", "дней", "дней"]);
	});
});

describe("formatNumber", () => {
	it("groups thousands per language", () => {
		expect(formatNumber(1240, "en")).toBe("1,240");
		expect(formatNumber(1240, "ru")).toBe("1\u00a0240");
		expect(formatNumber(999, "en")).toBe("999");
		expect(formatNumber(1234567, "en")).toBe("1,234,567");
		expect(formatNumber(-5, "en")).toBe("0");
	});
});
