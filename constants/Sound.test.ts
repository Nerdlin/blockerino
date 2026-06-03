import { getAudioModeOptions, getMusicTrackKey, mapSfxForPack, shouldPauseMusicForAppState } from "./Sound";

jest.mock("expo-audio", () => ({
	createAudioPlayer: jest.fn(),
	setAudioModeAsync: jest.fn(),
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
	getItem: jest.fn(),
	setItem: jest.fn(),
	removeItem: jest.fn(),
}));

describe("sound settings", () => {
	it("does not keep music playing after the app is backgrounded", () => {
		expect(getAudioModeOptions().shouldPlayInBackground).toBe(false);
		expect(shouldPauseMusicForAppState("background")).toBe(true);
		expect(shouldPauseMusicForAppState("inactive")).toBe(true);
		expect(shouldPauseMusicForAppState("active")).toBe(false);
	});

	it("uses distinct music assets for shop music packs", () => {
		expect(getMusicTrackKey("music_classic")).toBe("backgroundMusic");
		expect(getMusicTrackKey("music_lofi")).toBe("musicLofi");
		expect(getMusicTrackKey("music_arcade")).toBe("musicArcade");
		expect(getMusicTrackKey("music_cave")).toBe("musicCave");
		expect(getMusicTrackKey("music_space")).toBe("musicSpace");
	});

	it("uses distinct generated sfx assets for shop sound packs", () => {
		expect(mapSfxForPack("placeBlock", "sfx_wood")).toBe("sfxWoodPlace");
		expect(mapSfxForPack("breakLine", "sfx_glass")).toBe("sfxGlassClear");
		expect(mapSfxForPack("menuClick", "sfx_retro")).toBe("sfxRetroClick");
		expect(mapSfxForPack("invalidPlacement", "sfx_metal")).toBe("sfxMetalClick");
		expect(mapSfxForPack("gameOver", "sfx_classic")).toBe("gameOver");
	});
});
