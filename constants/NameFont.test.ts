import { nameFontFamily } from "./NameFont";

describe("nameFontFamily", () => {
	it("uses the Cyrillic pixel face only for names with Cyrillic letters", () => {
		expect(nameFontFamily("Разраб краса")).toBe("PixelifySans");
		expect(nameFontFamily("Nina_Ж")).toBe("PixelifySans");
		expect(nameFontFamily("Nerdlin")).toBe("Silkscreen");
		expect(nameFontFamily("Nerdlin", "SilkscreenBold")).toBe("SilkscreenBold");
		expect(nameFontFamily("")).toBe("Silkscreen");
		expect(nameFontFamily(null)).toBe("Silkscreen");
	});
});
