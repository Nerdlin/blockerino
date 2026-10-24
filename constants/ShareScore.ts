import { Platform, type View } from "react-native";
import type { RefObject } from "react";

// Sharing a finished game: the share card (see components/ShareCard.tsx) is drawn off screen, captured as a PNG
// and handed to the system share sheet. On the web there is no file sharing, so the text goes to the Web Share
// dialog or to the clipboard instead.

export const SHARE_URL = "https://blockerino.aionerdlin.me";

export type ShareResult = "shared" | "copied" | "failed";

export function buildShareText(score: number, modeTitle: string, template: string): string {
	return template.replace("{score}", String(score)).replace("{mode}", modeTitle).replace("{url}", SHARE_URL);
}

export async function shareScoreCard(card: RefObject<View | null>, text: string, dialogTitle: string): Promise<ShareResult> {
	try {
		if (Platform.OS === "web") {
			const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { share?: (data: { text: string }) => Promise<void> }) : null;
			if (nav?.share) {
				await nav.share({ text });
				return "shared";
			}
			if (nav?.clipboard?.writeText) {
				await nav.clipboard.writeText(text);
				return "copied";
			}
			return "failed";
		}
		if (!card.current) return "failed";
		// Loaded when needed: the game does not pay for the native modules until someone shares.
		const [{ captureRef }, Sharing] = await Promise.all([import("react-native-view-shot"), import("expo-sharing")]);
		if (!(await Sharing.isAvailableAsync())) return "failed";
		const uri = await captureRef(card, { format: "png", quality: 1, result: "tmpfile" });
		await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle, UTI: "public.png" });
		return "shared";
	} catch {
		// Closing the share sheet without choosing an app can also end here; nothing to report then.
		return "failed";
	}
}
