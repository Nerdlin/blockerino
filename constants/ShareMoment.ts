import { Platform, Share } from "react-native";
import { getPieceSkinColor } from "./Piece";
import { packColor, unpackColor, type MomentLog } from "./MomentRecorder";
import { renderMomentGif, type MomentGif, type MomentRenderOptions } from "./MomentFrames";
import { isDiscordActivityLocation } from "./DiscordEnvironment";
import { SHARE_URL } from "./ShareScore";

// "Share a moment": hands the GIF made by constants/MomentFrames.ts to the player.
//   Web:     a blob URL for the preview; Web Share API with the file where the browser has it, otherwise a download.
//            Inside a Discord Activity (an iframe) sharing and downloads can be blocked, so the picture is also shown
//            on screen to be saved from there (right click or long press).
//   Android: the GIF is written to the cache folder with expo-file-system and offered to the share sheet with
//            expo-sharing, the same way the PNG score card is shared. Both modules are already in the app build, so this
//            ships as an over-the-air update. If the file module cannot be loaded, the share text with the link is sent.

export type MomentShareResult = "shared" | "saved" | "link" | "cancelled" | "failed";

export interface MomentFile {
	/** What an <Image> can show: a blob URL on the web, a file:// URI on Android. */
	uri: string;
	fileName: string;
	bytes: Uint8Array;
	width: number;
	height: number;
	durationCs: number;
	/** Frees the blob URL or deletes the cached file. */
	release(): void;
}

export function isDiscordActivity(): boolean {
	return Platform.OS === "web" && typeof window !== "undefined" && isDiscordActivityLocation(window.location.hostname, window.location.search);
}

/** Lets the UI draw between the slices of work (a promise that resolves on the next timer tick). */
export function yieldToUi(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

/** The colour of a recorded piece with the player's equipped piece skin applied. */
export function skinColorMapper(skinId: string): (packed: number) => number {
	const cache = new Map<number, number>();
	return (packed: number) => {
		let mapped = cache.get(packed);
		if (mapped === undefined) {
			mapped = packColor(getPieceSkinColor(unpackColor(packed), skinId));
			cache.set(packed, mapped);
		}
		return mapped;
	};
}

export async function buildMomentGif(log: MomentLog, skinId: string, options: MomentRenderOptions = {}): Promise<MomentGif> {
	return renderMomentGif(log, { skinColor: skinColorMapper(skinId), ...options }, yieldToUi);
}

function momentFileName(): string {
	return `blockerino-moment-${Date.now()}.gif`;
}

type FileSystemModule = typeof import("expo-file-system");

function loadFileSystem(): FileSystemModule | null {
	try {
		// Loaded when needed, and optional for the bundler: a build without the module still plays.
		return require("expo-file-system") as FileSystemModule;
	} catch {
		return null;
	}
}

/** Makes the GIF available to show and share: a blob URL on the web, a cached file on Android. */
export async function createMomentFile(gif: MomentGif): Promise<MomentFile> {
	const fileName = momentFileName();
	const base = { fileName, bytes: gif.bytes, width: gif.width, height: gif.height, durationCs: gif.durationCs };
	if (Platform.OS === "web") {
		const url = URL.createObjectURL(new Blob([gif.bytes as unknown as BlobPart], { type: "image/gif" }));
		return { ...base, uri: url, release: () => URL.revokeObjectURL(url) };
	}
	const fs = loadFileSystem();
	if (!fs) throw new Error("expo-file-system is not available");
	const file = new fs.File(fs.Paths.cache, fileName);
	file.create({ overwrite: true });
	file.write(gif.bytes);
	return {
		...base,
		uri: file.uri,
		release: () => {
			try {
				file.delete();
			} catch {
				// the system clears the cache folder anyway
			}
		},
	};
}

function downloadOnWeb(file: MomentFile): void {
	const link = document.createElement("a");
	link.href = file.uri;
	link.download = file.fileName;
	link.rel = "noopener";
	link.style.display = "none";
	const body = document.body;
	body.appendChild(link);
	link.click();
	setTimeout(() => body.removeChild(link), 0);
}

type ShareNavigator = Navigator & { canShare?: (data: { files?: File[] }) => boolean; share?: (data: { files?: File[]; text?: string; title?: string }) => Promise<void> };

export interface MomentShareText {
	/** The sentence that goes with the GIF, link included. */
	text: string;
	dialogTitle: string;
}

/** Whether the browser can hand a file to a share sheet (phones mostly; desktop browsers download instead). */
export function canShareFiles(file: MomentFile): boolean {
	if (Platform.OS !== "web" || typeof navigator === "undefined" || typeof File === "undefined") return false;
	const nav = navigator as ShareNavigator;
	if (!nav.share || !nav.canShare) return false;
	try {
		return nav.canShare({ files: [new File([file.bytes as unknown as BlobPart], file.fileName, { type: "image/gif" })] });
	} catch {
		return false;
	}
}

/** Shares the GIF: the share sheet where the platform has one, a download on the web otherwise. */
export async function shareMomentFile(file: MomentFile, message: MomentShareText): Promise<MomentShareResult> {
	try {
		if (Platform.OS === "web") {
			const nav = typeof navigator !== "undefined" ? (navigator as ShareNavigator) : null;
			if (nav?.share && nav.canShare && typeof File !== "undefined") {
				const asFile = new File([file.bytes as unknown as BlobPart], file.fileName, { type: "image/gif" });
				if (nav.canShare({ files: [asFile] })) {
					try {
						await nav.share({ files: [asFile], text: message.text, title: message.dialogTitle });
						return "shared";
					} catch (error) {
						if ((error as { name?: string })?.name === "AbortError") return "cancelled";
						// not allowed here (an iframe without the permission, a browser that refuses): download instead
					}
				}
			}
			downloadOnWeb(file);
			return "saved";
		}
		// loaded when needed, like the file module: the game does not pay for sharing until someone shares
		const Sharing = require("expo-sharing") as typeof import("expo-sharing");
		if (!(await Sharing.isAvailableAsync())) throw new Error("sharing is not available");
		await Sharing.shareAsync(file.uri, { mimeType: "image/gif", dialogTitle: message.dialogTitle, UTI: "com.compuserve.gif" });
		return "shared";
	} catch {
		return "failed";
	}
}

/** The fallback when no GIF can be made or shared on this device: the text with the link. */
export async function shareMomentLink(message: MomentShareText): Promise<MomentShareResult> {
	try {
		if (Platform.OS === "web") {
			const nav = typeof navigator !== "undefined" ? (navigator as ShareNavigator) : null;
			if (nav?.share) {
				await nav.share({ text: message.text });
				return "link";
			}
			if (nav?.clipboard?.writeText) {
				await nav.clipboard.writeText(message.text);
				return "link";
			}
			return "failed";
		}
		await Share.share({ message: message.text, title: message.dialogTitle });
		return "link";
	} catch {
		return "failed";
	}
}

export function buildMomentShareText(template: string, score: number, modeTitle: string): string {
	return template.replace("{score}", String(score)).replace("{mode}", modeTitle).replace("{url}", SHARE_URL);
}
