// Real songs for the shop's music packs. Every song is CC0 (public domain); sources and authors are listed in
// docs/audio-credits.md and on the Licenses screen. The default music ("music_classic") is a playlist of songs
// shipped inside the app (constants/Sound.tsx); the other packs play songs from the game's website (public/music),
// loaded when the pack plays.

export type Mood = "calm" | "dark" | "action" | "world" | "space";

export interface RemoteSong {
	id: string;
	title: string;
	author: string;
	mood: Mood[];
}

export const REMOTE_SONGS: RemoteSong[] = [
	// Holizna — "Happy Lo-Fi", "Chill Beats", "Sad Lofi 1" (OpenGameArt, CC0)
	{ id: "holizna-poor-but-happy", title: "Poor, But Happy", author: "Holizna", mood: ["calm"] },
	{ id: "holizna-blue-skies", title: "Blue Skies", author: "Holizna", mood: ["calm"] },
	{ id: "holizna-letting-go", title: "Letting Go Of The Past", author: "Holizna", mood: ["calm"] },
	{ id: "holizna-puppy-love", title: "Puppy Love", author: "Holizna", mood: ["calm"] },
	{ id: "holizna-clouds", title: "Clouds", author: "Holizna", mood: ["calm", "space"] },
	{ id: "holizna-a-little-off", title: "Happy, but a little off", author: "Holizna", mood: ["calm"] },
	{ id: "holizna-new-shoes", title: "New Shoes", author: "Holizna", mood: ["calm"] },
	{ id: "holizna-city-rearview", title: "City In The Rearview", author: "Holizna", mood: ["calm", "space"] },
	{ id: "holizna-families", title: "Families", author: "Holizna", mood: ["calm"] },
	{ id: "holizna-opinions", title: "Opinions", author: "Holizna", mood: ["calm"] },
	{ id: "holizna-old-age", title: "Old Age", author: "Holizna", mood: ["calm", "space"] },
	{ id: "holizna-dream-pop", title: "Dream Pop", author: "Holizna", mood: ["space"] },
	{ id: "holizna-autumn", title: "Autumn", author: "Holizna", mood: ["calm", "space"] },
	{ id: "holizna-not-it", title: "Not It", author: "Holizna", mood: ["dark"] },
	{ id: "holizna-fire-place", title: "Fire Place", author: "Holizna", mood: ["dark", "calm"] },
	{ id: "holizna-small-towns", title: "Small Towns Smaller Lives", author: "Holizna", mood: ["dark"] },
	{ id: "holizna-winter-blues", title: "Winter Blues", author: "Holizna", mood: ["dark", "space"] },
	{ id: "holizna-yesterday", title: "Yesterday", author: "Holizna", mood: ["dark"] },
	// Juhani Junkala — "Retro Game Music Pack", "Chiptune Adventures", "12 Indie Game Music Loops" (CC0)
	{ id: "jj-retro-level-1", title: "Level 1", author: "Juhani Junkala", mood: ["action"] },
	{ id: "jj-retro-level-2", title: "Level 2", author: "Juhani Junkala", mood: ["action"] },
	{ id: "jj-retro-level-3", title: "Level 3", author: "Juhani Junkala", mood: ["action"] },
	{ id: "jj-retro-ending", title: "Ending", author: "Juhani Junkala", mood: ["world", "space"] },
	{ id: "jj-boss-fight", title: "Boss Fight", author: "Juhani Junkala", mood: ["action"] },
	{ id: "jj-heavy-metal", title: "Stage F", author: "Juhani Junkala", mood: ["action"] },
	{ id: "jj-gojira", title: "Gojira Battle", author: "Juhani Junkala", mood: ["action", "dark"] },
	// Phillip Miller (redactionary) — "Free NES Music Pack" (CC0)
	{ id: "nes-doom", title: "Doom", author: "Phillip Miller", mood: ["dark"] },
	{ id: "nes-blues", title: "Blues", author: "Phillip Miller", mood: ["world"] },
	{ id: "nes-cheery", title: "Cheery", author: "Phillip Miller", mood: ["world"] },
	{ id: "nes-hectic", title: "Hectic", author: "Phillip Miller", mood: ["action"] },
	{ id: "nes-jazz", title: "Jazz", author: "Phillip Miller", mood: ["world"] },
	{ id: "nes-lost-blues", title: "Lost Blues", author: "Phillip Miller", mood: ["dark", "world"] },
	{ id: "nes-simple", title: "Simple", author: "Phillip Miller", mood: ["world"] },
	{ id: "nes-soft-loud", title: "Soft Then Loud", author: "Phillip Miller", mood: ["action", "space"] },
	{ id: "nes-upbeat", title: "Upbeat", author: "Phillip Miller", mood: ["action"] },
	{ id: "nes-chill", title: "Chill", author: "Phillip Miller", mood: ["calm", "space"] },
	// single tracks (CC0)
	{ id: "wolfgang-cave", title: "8-Bit Cave Loop", author: "wolfgang_", mood: ["dark"] },
	{ id: "wolfgang-desert", title: "Desert Theme", author: "wolfgang_", mood: ["world"] },
	{ id: "wolfgang-haunted", title: "Haunted House", author: "wolfgang_", mood: ["dark"] },
	{ id: "randommind-bards-tale", title: "The Bard's Tale", author: "RandomMind", mood: ["world"] },
	{ id: "centurion-chippy", title: "Chippy Melody", author: "Centurion_of_war", mood: ["world", "action"] },
];

/** The mood of a shop music pack, from its id. */
export function moodOfPack(packId: string): Mood {
	const id = packId.replace(/^music_/, "");
	if (/^(lofi|rain|cafe|clouds|sunrise|ocean|snowfall|forest|puzzle|chip_calm|music_box|harp|minimal|deep_house|vapor)/.test(id)) return "calm";
	if (/^(arcade|hardstyle|breakbeat|drum|future|crystal_run|garage|marimba|techno|trap)/.test(id)) return "action";
	if (/^(cave|dungeon|noir|thunder|industrial|steel|glitch|percussion)/.test(id)) return "dark";
	if (/^(space|meteor|cosmic|circuit|desert_night)/.test(id)) return "space";
	return "world";
}

function hash(text: string): number {
	let h = 0;
	for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
	return h;
}

export const PACK_PLAYLIST_SIZE = 4;

/** The songs of a pack: 4 of its mood, starting at a place picked from the pack id, so packs of one mood differ. */
export function playlistForPack(packId: string): RemoteSong[] {
	const pool = REMOTE_SONGS.filter((song) => song.mood.includes(moodOfPack(packId)));
	const start = hash(packId) % pool.length;
	const step = pool.length > PACK_PLAYLIST_SIZE * 2 ? 2 : 1;
	const picked: RemoteSong[] = [];
	for (let i = 0; picked.length < Math.min(PACK_PLAYLIST_SIZE, pool.length) && i < pool.length * 2; i++) {
		const song = pool[(start + i * step) % pool.length];
		if (!picked.includes(song)) picked.push(song);
	}
	return picked;
}

const SITE = "https://blockerino.aionerdlin.me";

/** Where a song is loaded from: the site itself on the web (also inside Discord), the full address in the app. */
export function songUrl(id: string, isWeb: boolean): string {
	return isWeb ? `/music/${id}.mp3` : `${SITE}/music/${id}.mp3`;
}
