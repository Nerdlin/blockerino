import fs from "fs";
import path from "path";
import { REMOTE_SONGS, moodOfPack, playlistForPack, songUrl } from "./MusicCatalog";
import { PACK_SONGS, PACK_SONG_INFO } from "./PackSongs";
import { SHOP_ITEMS } from "./Shop";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

describe("music catalog", () => {
	it("every song is on the website and every pack has its own songs", () => {
		for (const song of REMOTE_SONGS) {
			expect(fs.existsSync(path.join(__dirname, "..", "public", "music", `${song.id}.mp3`))).toBe(true);
		}
		const packs = SHOP_ITEMS.filter((item) => item.category === "music" && item.id !== "music_classic");
		expect(packs.length).toBeGreaterThan(20);
		for (const pack of packs) {
			// every pack plays its own songs, picked for its name
			expect(PACK_SONGS[pack.id]?.length ?? 0).toBeGreaterThanOrEqual(3);
			const list = playlistForPack(pack.id);
			expect(list.map((song) => song.id)).toEqual(PACK_SONGS[pack.id]);
			expect(new Set(list.map((song) => song.id)).size).toBe(list.length);
			for (const song of list) {
				expect(PACK_SONG_INFO[song.id]).toBeDefined();
				expect(PACK_SONG_INFO[song.id].source.startsWith("https://opengameart.org/content/")).toBe(true);
			}
		}
		// the packs do not all play the same songs
		expect(new Set(packs.map((pack) => PACK_SONGS[pack.id].join(","))).size).toBeGreaterThan(packs.length - 3);
	});

	it("moods and addresses", () => {
		expect(moodOfPack("music_lofi_rain")).toBe("calm");
		expect(moodOfPack("music_arcade_turbo")).toBe("action");
		expect(moodOfPack("music_cave_drip")).toBe("dark");
		expect(moodOfPack("music_space_orbit")).toBe("space");
		expect(moodOfPack("music_salsa")).toBe("world");
		expect(songUrl("nes-jazz", true)).toBe("/music/nes-jazz.mp3");
		expect(songUrl("nes-jazz", false)).toBe("https://blockerino.aionerdlin.me/music/nes-jazz.mp3");
		expect(songUrl("oga-harp", true)).toBe("https://music.aionerdlin.me/oga-harp.mp3");
		expect(songUrl("oga-harp", false)).toBe("https://music.aionerdlin.me/oga-harp.mp3");
	});
});
