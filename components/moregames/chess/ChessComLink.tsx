import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { ChessComLink, lookupChessCom, saveChessComLink } from "@/constants/chess/ChessCom";
import { TIME_CLASSES } from "@/constants/chess/TimeControls";
import StylizedButton from "../../StylizedButton";
import { PixelIcon } from "./PixelIcon";

/**
 * Links a chess.com account by its username and shows its ratings. The ratings are a hint only: chess.com's public
 * API does not prove the account is the player's, so they never replace the Elo earned here.
 */
export function ChessComLinkScreen({ link, onChange, onBack }: { link: ChessComLink | null; onChange: (link: ChessComLink | null) => void; onBack: () => void }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const [username, setUsername] = useState(link?.username ?? "");
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<string | null>(null);

	const lookup = async (name: string) => {
		setBusy(true);
		setMessage(null);
		const result = await lookupChessCom(name);
		setBusy(false);
		if (result.status === "ok") {
			await saveChessComLink(result.link);
			onChange(result.link);
		} else {
			setMessage(t(`chesscom.${result.status}`));
		}
	};

	const unlink = async () => {
		await saveChessComLink(null);
		onChange(null);
		setUsername("");
	};

	return (
		<View style={local.screen}>
			<Text style={[local.note, { color: currentTheme.textSecondary }]}>{t("chesscom.note")}</Text>
			{link ? (
				<>
					<Text testID="chesscom-username" style={[local.name, { color: currentTheme.textPrimary }]}>{link.username}</Text>
					<View style={local.row}>
						{TIME_CLASSES.map((timeClass) => (
							<View key={timeClass} style={[local.card, { borderColor: "rgba(255,255,255,0.18)" }]}>
								<PixelIcon name={timeClass === "bullet" ? "bullet" : timeClass === "blitz" ? "blitz" : "rapid"} size={22} />
								<Text style={[local.small, { color: currentTheme.textSecondary }]}>{t(`chess.${timeClass}`)}</Text>
								<Text style={[local.big, { color: currentTheme.textPrimary }]}>{link.ratings[timeClass] ?? "—"}</Text>
							</View>
						))}
					</View>
					{link.puzzles ? <Text style={[local.small, { color: currentTheme.textSecondary }]}>{t("chesscom.puzzles", { n: link.puzzles })}</Text> : null}
					<View style={local.buttons}>
						<StylizedButton text={busy ? "..." : t("chesscom.refresh")} onClick={() => void lookup(link.username)} backgroundColor="#2E9E4F" style={local.button} textStyle={{ fontSize: 11 }} />
						<StylizedButton text={t("chesscom.unlink")} onClick={() => void unlink()} backgroundColor="#7F1D1D" style={local.button} textStyle={{ fontSize: 11 }} />
					</View>
				</>
			) : (
				<>
					<TextInput
						testID="chesscom-input"
						value={username}
						onChangeText={setUsername}
						autoCapitalize="none"
						autoCorrect={false}
						placeholder={t("chesscom.placeholder")}
						placeholderTextColor={currentTheme.textSecondary}
						maxLength={25}
						onSubmitEditing={() => void lookup(username)}
						style={[local.input, { color: currentTheme.textPrimary, borderColor: currentTheme.accent }]}
					/>
					<StylizedButton text={busy ? "..." : t("chesscom.link")} onClick={() => void lookup(username)} backgroundColor="#2E9E4F" style={local.button} textStyle={{ fontSize: 12 }} disabled={busy} />
				</>
			)}
			{message ? <Text style={local.error}>{message}</Text> : null}
			<StylizedButton text={t("common.back")} onClick={onBack} backgroundColor="#555" style={local.button} textStyle={{ fontSize: 11 }} />
		</View>
	);
}

const local = StyleSheet.create({
	screen: { width: "100%", maxWidth: 420, alignSelf: "center", alignItems: "center", gap: 12, paddingVertical: 8 },
	note: { fontFamily: "Silkscreen", fontSize: 10, textAlign: "center", lineHeight: 15 },
	name: { fontFamily: "SilkscreenBold", fontSize: 18 },
	row: { flexDirection: "row", gap: 8, width: "100%" },
	card: { flex: 1, borderWidth: 2, borderRadius: 10, paddingVertical: 10, alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.04)" },
	small: { fontFamily: "Silkscreen", fontSize: 10 },
	big: { fontFamily: "SilkscreenBold", fontSize: 18 },
	buttons: { flexDirection: "row", gap: 10 },
	button: { minWidth: 120, height: 42, minHeight: 42, margin: 0 },
	input: { width: "100%", borderWidth: 2, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, textAlign: "center" },
	error: { color: "#F87171", fontFamily: "Silkscreen", fontSize: 11, textAlign: "center" },
});
