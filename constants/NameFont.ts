// Player nicknames can be in any language, but the English pixel face (Silkscreen) has no Cyrillic letters, so a
// Russian nickname in an English-language app fell back to a plain system font. Names with Cyrillic use the
// Cyrillic pixel face (registered as "PixelifySans" next to Silkscreen in app/index.tsx).

const CYRILLIC = /[Ѐ-ӿ]/;

export function nameFontFamily(name: string | null | undefined, base: "Silkscreen" | "SilkscreenBold" = "Silkscreen"): string {
	return name && CYRILLIC.test(name) ? "PixelifySans" : base;
}
