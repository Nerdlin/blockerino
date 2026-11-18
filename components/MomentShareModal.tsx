import React, { useEffect, useRef, useState } from "react";
import { Image, Platform, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useAtomValue } from "jotai";
import StylizedButton from "./StylizedButton";
import PixelLoader from "./PixelLoader";
import { shopStateAtom } from "@/constants/Shop";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { track } from "@/constants/Analytics";
import type { MomentLog } from "@/constants/MomentRecorder";
import { FRAME_HEIGHT, FRAME_WIDTH } from "@/constants/MomentFrames";
import {
	buildMomentGif,
	canShareFiles,
	createMomentFile,
	isDiscordActivity,
	shareMomentFile,
	shareMomentLink,
	yieldToUi,
	type MomentFile,
	type MomentShareResult,
} from "@/constants/ShareMoment";

type Phase = "building" | "ready" | "failed";

/**
 * "Share a moment": makes the GIF of the last moves, shows it and offers it to the system share sheet
 * (or a download on the web). Everything is drawn from the move log, see constants/MomentFrames.ts.
 */
export default function MomentShareModal({
	log,
	caption,
	dimLastFrame,
	message,
	source,
	onClose,
}: {
	log: MomentLog;
	/** Words on the last frame, already translated (e.g. "Game over"). */
	caption: string;
	dimLastFrame?: boolean;
	/** The sentence that goes with the GIF when it is shared, link included. */
	message: string;
	/** Where the offer came from, for the usage statistics ("game_over", "combo", "versus"). */
	source: string;
	onClose: () => void;
}) {
	const { t } = useLanguage();
	const { currentTheme } = useTheme();
	const { width } = useWindowDimensions();
	const skinId = useAtomValue(shopStateAtom).equipped.piece_skin;
	const [phase, setPhase] = useState<Phase>("building");
	const [file, setFile] = useState<MomentFile | null>(null);
	const [note, setNote] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const fileRef = useRef<MomentFile | null>(null);
	const discord = isDiscordActivity();

	useEffect(() => {
		let cancelled = false;
		(async () => {
			// two ticks, so the window is on screen before the drawing starts
			await yieldToUi();
			await yieldToUi();
			try {
				const gif = await buildMomentGif(log, skinId, {
					labels: {
						score: t("moment.labelScore"),
						combo: t("moment.labelCombo"),
						caption,
						captionScore: t("moment.labelScore"),
					},
					dimLastFrame,
				});
				const made = await createMomentFile(gif);
				if (cancelled) {
					made.release();
					return;
				}
				fileRef.current = made;
				setFile(made);
				setPhase("ready");
				track("moment_made", { source, moves: log.moves.length, kb: Math.round(gif.bytes.length / 1024), ms: Math.round(gif.durationCs * 10) });
			} catch {
				if (!cancelled) setPhase("failed");
			}
		})();
		return () => {
			cancelled = true;
			fileRef.current?.release();
			fileRef.current = null;
		};
		// the GIF is made once for the log this window was opened with
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const shareText = { text: message, dialogTitle: t("moment.title") };
	const canShareSheet = file ? Platform.OS !== "web" || canShareFiles(file) : false;

	const report = (result: MomentShareResult) => {
		track("moment_share", { source, result, platform: Platform.OS });
		if (result === "saved") setNote(t("moment.saved"));
		else if (result === "shared") setNote(t("moment.shared"));
		else if (result === "link") setNote(t("moment.linkShared"));
		else if (result === "failed") setNote(t("moment.shareFailed"));
	};

	const handleShare = async () => {
		if (!file || busy) return;
		setBusy(true);
		setNote(null);
		report(await shareMomentFile(file, shareText));
		setBusy(false);
	};

	const handleLink = async () => {
		if (busy) return;
		setBusy(true);
		setNote(null);
		report(await shareMomentLink(shareText));
		setBusy(false);
	};

	const previewWidth = Math.min(300, width - 56);
	const previewHeight = Math.round((previewWidth * FRAME_HEIGHT) / FRAME_WIDTH);

	return (
		<View style={styles.backdrop}>
			<View style={[styles.panel, { backgroundColor: currentTheme.menuBackground, borderColor: currentTheme.accent }]}>
				<Text style={[styles.title, { color: currentTheme.accent }]}>{t("moment.title")}</Text>

				<View style={[styles.preview, { width: previewWidth, height: previewHeight }]}>
					{phase === "ready" && file && (
						<Image
							source={{ uri: file.uri }}
							style={[{ width: previewWidth, height: previewHeight }, Platform.OS === "web" ? ({ imageRendering: "pixelated" } as object) : null]}
							resizeMode="contain"
							accessibilityLabel={t("moment.title")}
						/>
					)}
					{phase === "building" && (
						<View style={styles.center}>
							<PixelLoader size="large" color={currentTheme.accent} />
							<Text style={[styles.hint, { color: currentTheme.textSecondary }]}>{t("moment.building")}</Text>
						</View>
					)}
					{phase === "failed" && (
						<View style={styles.center}>
							<Text style={[styles.hint, { color: currentTheme.textSecondary }]}>{t("moment.failed")}</Text>
						</View>
					)}
				</View>

				{phase === "ready" && discord && <Text style={[styles.hint, { color: currentTheme.textSecondary }]}>{t("moment.discordHint")}</Text>}
				{note && <Text style={[styles.hint, { color: currentTheme.textPrimary }]}>{note}</Text>}

				<View style={styles.buttons}>
					{phase === "ready" && (
						<StylizedButton
							text={canShareSheet ? t("moment.share") : t("moment.save")}
							onClick={handleShare}
							disabled={busy}
							backgroundColor={currentTheme.buttonPrimary}
							style={styles.button}
						/>
					)}
					{phase === "failed" && (
						<StylizedButton text={t("moment.sendLink")} onClick={handleLink} disabled={busy} backgroundColor={currentTheme.buttonPrimary} style={styles.button} />
					)}
					<StylizedButton
						text={t("moment.close")}
						onClick={onClose}
						backgroundColor="rgba(255,255,255,0.08)"
						borderColor="rgba(255,255,255,0.14)"
						style={styles.button}
					/>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	backdrop: {
		...StyleSheet.absoluteFillObject,
		zIndex: 5000,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(0, 0, 0, 0.8)",
		padding: 16,
	},
	panel: {
		alignItems: "center",
		gap: 12,
		paddingVertical: 18,
		paddingHorizontal: 16,
		borderWidth: 2,
		borderRadius: 12,
		maxWidth: 380,
		width: "100%",
	},
	title: {
		fontFamily: "Silkscreen",
		fontSize: 20,
		textAlign: "center",
	},
	preview: {
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#0c0f18",
		borderRadius: 6,
		overflow: "hidden",
	},
	center: {
		alignItems: "center",
		gap: 12,
		paddingHorizontal: 12,
	},
	hint: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		textAlign: "center",
	},
	buttons: {
		alignSelf: "stretch",
		gap: 8,
	},
	button: {
		width: "100%",
	},
});
