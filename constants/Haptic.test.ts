jest.mock("@react-native-async-storage/async-storage", () => {
	const store: Record<string, string> = {};
	return {
		__esModule: true,
		default: {
			getItem: jest.fn(async (key: string) => (key in store ? store[key] : null)),
			setItem: jest.fn(async (key: string, value: string) => { store[key] = value; }),
		},
	};
});
jest.mock("expo-haptics", () => ({
	impactAsync: jest.fn(() => Promise.resolve()),
	notificationAsync: jest.fn(() => Promise.resolve()),
	ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
	NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));
jest.mock("react-native", () => ({ Platform: { OS: "android" } }));

import * as Haptics from "expo-haptics";
import { buzz, hapticEnabledSetting, hapticLevelSetting, impactFor } from "./Haptic";

describe("vibration strength", () => {
	it("maps an impact to the chosen level", () => {
		expect(impactFor("heavy", 0)).toBe("light");
		expect(impactFor("medium", 1)).toBe("medium");
		expect(impactFor("light", 2)).toBe("medium");
		expect(impactFor("medium", 2)).toBe("heavy");
	});
});

describe("buzz", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		hapticEnabledSetting.set(true);
		hapticLevelSetting.set(1);
	});
	it("sends the vibration the caller asked for at the normal level", () => {
		buzz("medium");
		expect(Haptics.impactAsync).toHaveBeenCalledWith("medium");
		buzz("success");
		expect(Haptics.notificationAsync).toHaveBeenCalledWith("success");
	});
	it("does nothing when vibration is off", () => {
		hapticEnabledSetting.set(false);
		buzz("heavy");
		buzz("error");
		expect(Haptics.impactAsync).not.toHaveBeenCalled();
		expect(Haptics.notificationAsync).not.toHaveBeenCalled();
	});
	it("turns everything into a light tap at the gentlest level and strengthens taps at the strongest", () => {
		hapticLevelSetting.set(0);
		buzz("error");
		expect(Haptics.impactAsync).toHaveBeenLastCalledWith("light");
		hapticLevelSetting.set(2);
		buzz("light");
		expect(Haptics.impactAsync).toHaveBeenLastCalledWith("medium");
	});
});
