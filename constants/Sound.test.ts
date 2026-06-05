import { getAudioModeOptions, getCustomAudioSourceInfo, getMusicTrackKey, mapSfxForPack, shouldPauseMusicForAppState } from "./Sound";

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
		expect(getMusicTrackKey("music_lofi_rain")).toBe("musicRainPiano");
		expect(getMusicTrackKey("music_arcade_turbo")).toBe("musicDrumBass");
		expect(getMusicTrackKey("music_cave_echo")).toBe("musicNoir");
		expect(getMusicTrackKey("music_space_void")).toBe("musicMarch");
		expect(getMusicTrackKey("music_future_bass")).toBe("musicFutureBass");
	});

	it("uses distinct generated sfx assets for shop sound packs", () => {
		expect(mapSfxForPack("placeBlock", "sfx_wood")).toBe("sfxWoodPlace");
		expect(mapSfxForPack("breakLine", "sfx_glass")).toBe("sfxGlassClear");
		expect(mapSfxForPack("menuClick", "sfx_retro")).toBe("sfxRetroClick");
		expect(mapSfxForPack("invalidPlacement", "sfx_metal")).toBe("sfxMetalClick");
		expect(mapSfxForPack("placeBlock", "sfx_wood_oak")).toBe("sfxPaperPlace");
		expect(mapSfxForPack("breakLine", "sfx_glass_prism")).toBe("sfxToyClear");
		expect(mapSfxForPack("menuClick", "sfx_retro_coin")).toBe("sfxFireClick");
		expect(mapSfxForPack("invalidPlacement", "sfx_metal_titan")).toBe("sfxSoftClick");
		expect(mapSfxForPack("breakLine", "sfx_wind")).toBe("sfxWindClear");
		expect(mapSfxForPack("gameOver", "sfx_classic")).toBe("gameOver");
	});

	it("accepts external music providers without treating them as in-game streams", () => {
		expect(getCustomAudioSourceInfo("https://www.youtube.com/watch?v=test")).toMatchObject({
			kind: "youtube",
			canPlayInApp: false,
		});
		expect(getCustomAudioSourceInfo("https://open.spotify.com/track/test")).toMatchObject({
			kind: "spotify",
			canPlayInApp: false,
		});
		expect(getCustomAudioSourceInfo("https://music.yandex.ru/album/1/track/2")).toMatchObject({
			kind: "yandex",
			canPlayInApp: false,
		});
		expect(getCustomAudioSourceInfo("https://example.com/song.mp3?token=1")).toMatchObject({
			kind: "direct",
			canPlayInApp: true,
		});
	});
});
