import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import { isOnline } from "./NetworkStatus";

// Songs of the shop's music packs live in the cloud (constants/MusicCatalog.ts). A song that has been played is
// kept on the device (the app: a file in the document folder, the web: the Cache API), so it plays without a
// network next time. Nothing is downloaded ahead: only songs that were chosen and played.

export type MusicSourceChoice = "cache" | "remote" | "none";

/** Where a song is played from: the saved copy first, then the cloud; with neither, nothing (the caller falls back). */
export function chooseMusicSource(cached: boolean, online: boolean): MusicSourceChoice {
	if (cached) return "cache";
	return online ? "remote" : "none";
}

/** A file name that is safe on every platform. */
export function musicCacheFileName(songId: string): string {
	return `${songId.replace(/[^a-zA-Z0-9_-]/g, "_")}.mp3`;
}

const WEB_CACHE_NAME = "blockerino-music-v1";
const NATIVE_DIR = "music-cache";
const saving = new Set<string>();

function nativeFile(songId: string): File {
	return new File(new Directory(Paths.document, NATIVE_DIR), musicCacheFileName(songId));
}

async function savedWebSong(url: string): Promise<string | null> {
	try {
		if (typeof caches === "undefined") return null;
		const cache = await caches.open(WEB_CACHE_NAME);
		const hit = await cache.match(url);
		if (!hit) return null;
		return URL.createObjectURL(await hit.blob());
	} catch {
		return null;
	}
}

async function saveWebSong(url: string): Promise<void> {
	if (typeof caches === "undefined") return;
	const cache = await caches.open(WEB_CACHE_NAME);
	if (await cache.match(url)) return;
	await cache.add(url);
}

async function saveNativeSong(songId: string, url: string): Promise<void> {
	const dir = new Directory(Paths.document, NATIVE_DIR);
	dir.create({ intermediates: true, idempotent: true });
	const finalFile = nativeFile(songId);
	if (finalFile.exists) return;
	// into a temporary name first, so a download cut off halfway is never mistaken for a whole song
	const part = new File(dir, `${musicCacheFileName(songId)}.part`);
	if (part.exists) part.delete();
	const downloaded = await File.downloadFileAsync(url, part, { idempotent: true });
	downloaded.move(finalFile);
}

/**
 * The address to play a song from, or null when it is neither saved nor reachable (offline). A song that is not
 * saved yet is played from the cloud and saved in the background.
 */
export async function resolveMusicSource(songId: string, remoteUrl: string): Promise<string | null> {
	let savedUri: string | null = null;
	try {
		if (Platform.OS === "web") {
			savedUri = await savedWebSong(remoteUrl);
		} else {
			const file = nativeFile(songId);
			savedUri = file.exists ? file.uri : null;
		}
	} catch {
		savedUri = null;
	}

	const choice = chooseMusicSource(savedUri !== null, savedUri !== null || (await isOnline()));
	if (choice === "cache") return savedUri;
	if (choice === "none") return null;

	if (!saving.has(songId)) {
		saving.add(songId);
		const save = Platform.OS === "web" ? saveWebSong(remoteUrl) : saveNativeSong(songId, remoteUrl);
		save.catch(() => undefined).finally(() => saving.delete(songId));
	}
	return remoteUrl;
}
