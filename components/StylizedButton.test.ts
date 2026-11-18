import { readableTextColor } from "./StylizedButton";

describe("readableTextColor", () => {
	it("uses dark text on light fills", () => {
		expect(readableTextColor("#FFD700")).toBe("#111111");
		expect(readableTextColor("#38BDF8")).toBe("#111111");
		expect(readableTextColor("rgb(240, 240, 240)")).toBe("#111111");
	});
	it("keeps the default on dark, translucent and unknown fills", () => {
		expect(readableTextColor("#7C3AED")).toBeUndefined();
		expect(readableTextColor("rgb(220, 70, 50)")).toBeUndefined();
		expect(readableTextColor("transparent")).toBeUndefined();
		expect(readableTextColor("rgba(255, 255, 255, 0.2)")).toBeUndefined();
		expect(readableTextColor(undefined)).toBeUndefined();
	});
});
