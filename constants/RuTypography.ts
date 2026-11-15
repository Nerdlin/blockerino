import { Platform, StyleSheet } from "react-native";

// The Russian face (Pixelify, assets/fonts/PixelifySans-Ru.ttf) stands in for Silkscreen under the same family names,
// but its letters are bigger at large sizes and harder to read at small ones. In Russian every style that uses the
// pixel face gets a gentler size: big titles a little smaller, small print a little bigger. The size is worked out
// when the text is drawn (a getter), because styles are created before the saved language is known.
// Loaded first of all (index.js), before any StyleSheet.create runs. Native only: react-native-web reads styles
// when they are created.

const PIXEL_FAMILIES = new Set(["Silkscreen", "SilkscreenBold"]);
let russian = false;

/** Called once the boot language is known, before the first screen draws. */
export function setRussianTypography(on: boolean): void {
	russian = on;
}

/** The size a pixel-face text gets in Russian. */
export function russianFontSize(size: number): number {
	if (size >= 28) return Math.round(size * 0.88);
	if (size >= 20) return Math.round(size * 0.92);
	if (size <= 10) return size + 1.5;
	if (size <= 13) return size + 1;
	return size;
}

function adjust(style: Record<string, unknown>): void {
	if (!PIXEL_FAMILIES.has(style.fontFamily as string) || typeof style.fontSize !== "number") return;
	const base = style.fontSize;
	const baseLineHeight = typeof style.lineHeight === "number" ? style.lineHeight : null;
	Object.defineProperty(style, "fontSize", {
		enumerable: true,
		configurable: true,
		get: () => (russian ? russianFontSize(base) : base),
	});
	if (baseLineHeight !== null) {
		// a fixed line height follows the font size, so the text is not cut or squeezed
		Object.defineProperty(style, "lineHeight", {
			enumerable: true,
			configurable: true,
			get: () => (russian ? Math.round((baseLineHeight * russianFontSize(base)) / base) : baseLineHeight),
		});
	}
}

if (Platform.OS !== "web") {
	const create = StyleSheet.create;
	StyleSheet.create = ((styles: Record<string, unknown>) => {
		for (const key in styles) {
			const style = styles[key];
			if (style && typeof style === "object") adjust(style as Record<string, unknown>);
		}
		return create(styles as never);
	}) as typeof StyleSheet.create;
}
