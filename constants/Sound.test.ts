import { SHOP_ITEMS } from "./Shop";
import { createAudioPlayer } from "expo-audio";
import { getAudioModeOptions, getCustomAudioSourceInfo, getMusicTrackKey, hasMusicTrackForPack, hasSfxAssetsForPack, mapSfxForPack, shouldPauseMusicForAppState, soundManager } from "./Sound";

jest.mock("expo-audio", () => ({
	createAudioPlayer: jest.fn(),
	setAudioModeAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
	getItem: jest.fn(),
	setItem: jest.fn(),
	removeItem: jest.fn(),
}));

describe("sound settings", () => {
	it("does not keep music playing after the app is backgrounded", () => {
		expect(getAudioModeOptions().shouldPlayInBackground).toBe(false);
		// no audio focus: notifications and other apps do not stop the game's sounds
		expect(getAudioModeOptions().interruptionMode).toBe("mixWithOthers");
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
		expect(getMusicTrackKey("music_bossa_blocks")).toBe("musicBossaBlocks");
		expect(getMusicTrackKey("music_cosmic_bell")).toBe("musicCosmicBell");
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
		expect(mapSfxForPack("placeBlock", "sfx_quartz")).toBe("sfxQuartzPlace");
		expect(mapSfxForPack("menuClick", "sfx_void")).toBe("sfxVoidClick");
		expect(mapSfxForPack("gameOver", "sfx_classic")).toBe("gameOver");
	});

	it("maps every shop music and sfx item to a playable pack", () => {
		const musicIds = SHOP_ITEMS.filter((item) => item.category === "music").map((item) => item.id);
		const sfxIds = SHOP_ITEMS.filter((item) => item.category === "sfx").map((item) => item.id);

		expect(musicIds.filter((id) => !hasMusicTrackForPack(id))).toEqual([]);
		expect(sfxIds.filter((id) => !hasSfxAssetsForPack(id))).toEqual([]);
	});

	it("reuses sound effect players and releases the least recently used ones", async () => {
		const players: { release: jest.Mock; play: jest.Mock }[] = [];
		(createAudioPlayer as jest.Mock).mockImplementation(() => {
			const player = { volume: 1, playing: false, isBuffering: false, seekTo: jest.fn(() => Promise.resolve()), play: jest.fn(), pause: jest.fn(), remove: jest.fn(), release: jest.fn() };
			players.push(player);
			return player;
		});
		let now = 1_000_000;
		const clock = jest.spyOn(Date, "now").mockImplementation(() => now);
		try {
			for (let i = 0; i < 5; i++) {
				await soundManager.playSfx("placeBlock");
				now += 500;
			}
			// one player, started five times
			expect(players).toHaveLength(1);
			expect(players[0].play).toHaveBeenCalledTimes(5);

			const keys = ["breakLine", "comboX2", "comboX3", "comboX4", "comboX5", "gameOver", "menuClick", "invalidPlacement", "buttonHover", "achievement", "chessMove", "chessCapture", "chessCheck", "chessCastle", "chessPromote", "chessStart", "chessWin", "chessLose"] as const;
			for (const key of keys) {
				await soundManager.playSfx(key);
				now += 500;
			}
			// never more than 16 players are kept: the oldest ones were released
			expect(players.filter((player) => player.release.mock.calls.length === 0)).toHaveLength(16);
			expect(players[0].release).toHaveBeenCalled();
		} finally {
			clock.mockRestore();
		}
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

describe("music playlist", () => {
	const { MUSIC_PLAYLIST, isPlaylistPack, nextPlaylistTrack } = jest.requireActual("./Sound");
	it("the default music is a playlist of songs, never the same song twice in a row", () => {
		expect(isPlaylistPack("music_classic")).toBe(true);
		expect(isPlaylistPack("music_lofi")).toBe(false);
		expect(MUSIC_PLAYLIST.length).toBeGreaterThanOrEqual(8);
		for (const current of MUSIC_PLAYLIST) {
			for (const r of [0, 0.3, 0.6, 0.9999]) {
				const next = nextPlaylistTrack(current, () => r);
				expect(next).not.toBe(current);
				expect(MUSIC_PLAYLIST).toContain(next);
			}
		}
	});
});
