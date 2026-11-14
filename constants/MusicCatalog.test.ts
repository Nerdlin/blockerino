import fs from "fs";
import path from "path";
import { REMOTE_SONGS, moodOfPack, playlistForPack, songUrl } from "./MusicCatalog";
import { SHOP_ITEMS } from "./Shop";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

describe("music catalog", () => {
	it("every song is on the website and every pack has its own songs", () => {
		for (const song of REMOTE_SONGS) {
			expect(fs.existsSync(path.join(__dirname, "..", "public", "music", `${song.id}.mp3`))).toBe(true);
		}
		const packs = SHOP_ITEMS.filter((item) => item.category === "music" && item.id !== "music_classic" && item.id !== "music_custom");
		expect(packs.length).toBeGreaterThan(20);
		for (const pack of packs) {
			const list = playlistForPack(pack.id);
			expect(list.length).toBeGreaterThanOrEqual(3);
			expect(new Set(list.map((song) => song.id)).size).toBe(list.length);
			for (const song of list) expect(song.mood).toContain(moodOfPack(pack.id));
		}
		// packs of one mood do not all play the same songs
		const calm = packs.filter((pack) => moodOfPack(pack.id) === "calm").map((pack) => playlistForPack(pack.id)[0].id);
		expect(new Set(calm).size).toBeGreaterThan(1);
	});

	it("moods and addresses", () => {
		expect(moodOfPack("music_lofi_rain")).toBe("calm");
		expect(moodOfPack("music_arcade_turbo")).toBe("action");
		expect(moodOfPack("music_cave_drip")).toBe("dark");
		expect(moodOfPack("music_space_orbit")).toBe("space");
		expect(moodOfPack("music_salsa")).toBe("world");
		expect(songUrl("nes-jazz", true)).toBe("/music/nes-jazz.mp3");
		expect(songUrl("nes-jazz", false)).toBe("https://blockerino.aionerdlin.me/music/nes-jazz.mp3");
	});
});
