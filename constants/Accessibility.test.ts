jest.mock("@react-native-async-storage/async-storage", () => ({
	__esModule: true,
	default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock("react-native-reanimated", () => ({ useReducedMotion: () => false }));

import { parseMotionPreference, shouldReduceMotion } from "./Accessibility";

describe("motion preference", () => {
	it("reads only known values and falls back to auto", () => {
		expect(parseMotionPreference({ motion: "reduced" })).toBe("reduced");
		expect(parseMotionPreference({ motion: "full" })).toBe("full");
		expect(parseMotionPreference({ motion: "weird" })).toBe("auto");
		expect(parseMotionPreference(null)).toBe("auto");
		expect(parseMotionPreference("reduced")).toBe("auto");
	});

	it("auto follows the system setting, an explicit choice wins", () => {
		expect(shouldReduceMotion("auto", true)).toBe(true);
		expect(shouldReduceMotion("auto", false)).toBe(false);
		expect(shouldReduceMotion("reduced", false)).toBe(true);
		expect(shouldReduceMotion("full", true)).toBe(false);
	});
});
