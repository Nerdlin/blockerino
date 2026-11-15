jest.mock("react-native", () => ({
	Platform: { OS: "android" },
	StyleSheet: { create: (styles: unknown) => styles },
}));

import { StyleSheet } from "react-native";
import { russianFontSize, setRussianTypography } from "./RuTypography";

describe("Russian typography", () => {
	it("makes big titles smaller and small print bigger", () => {
		expect(russianFontSize(36)).toBeLessThan(36);
		expect(russianFontSize(24)).toBeLessThan(24);
		expect(russianFontSize(16)).toBe(16);
		expect(russianFontSize(11)).toBe(12);
		expect(russianFontSize(10)).toBeGreaterThan(10);
	});

	it("applies to pixel-face styles only, and only in Russian", () => {
		const styles = StyleSheet.create({
			title: { fontFamily: "Silkscreen", fontSize: 30, lineHeight: 36 },
			body: { fontFamily: "SpaceMono", fontSize: 30 },
		}) as { title: { fontSize: number; lineHeight: number }; body: { fontSize: number } };
		setRussianTypography(false);
		expect(styles.title.fontSize).toBe(30);
		setRussianTypography(true);
		expect(styles.title.fontSize).toBe(russianFontSize(30));
		expect(styles.title.lineHeight).toBe(Math.round((36 * russianFontSize(30)) / 30));
		expect(styles.body.fontSize).toBe(30);
		setRussianTypography(false);
	});
});
