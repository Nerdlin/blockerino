import { useEffect, useState } from "react";
import { Clipboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { ChessComLink, lookupChessCom, saveChessComLink } from "@/constants/chess/ChessCom";
import { ChessComImportStatus, fetchChessComImportStatus, importChessComRating } from "@/constants/chess/ChessComImport";
import { TIME_CLASSES } from "@/constants/chess/TimeControls";
import StylizedButton from "../../StylizedButton";
import { PixelIcon } from "./PixelIcon";

/** Moving the linked account's rating over, once, after the player put the code into their chess.com profile. */
function ImportPanel({ username, onImported }: { username: string; onImported: () => void }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const [status, setStatus] = useState<ChessComImportStatus | null>(null);
	const [busy, setBusy] = useState(false);
	const [copied, setCopied] = useState(false);
	const [message, setMessage] = useState<string | null>(null);

	useEffect(() => {
		let active = true;
		void fetchChessComImportStatus().then((next) => active && setStatus(next));
		return () => {
			active = false;
		};
	}, []);

	if (!status || status.status === "failed") return null;
	if (status.status === "signed_out") return <Text style={[local.note, { color: currentTheme.textSecondary }]}>{t("chesscom.signInToImport")}</Text>;
	if (status.status === "imported") {
		return (
			<View style={[local.importBox, { borderColor: "#2E9E4F" }]}>
				<Text style={[local.importTitle, { color: "#4ADE80" }]}>{t("chesscom.imported", { name: status.username })}</Text>
				<Text style={[local.note, { color: currentTheme.textSecondary }]}>{t("chesscom.importedHint")}</Text>
			</View>
		);
	}

	const code = status.code;
	const check = async () => {
		setBusy(true);
		setMessage(null);
		const result = await importChessComRating(username);
		setBusy(false);
		if (result.status === "imported") {
			setStatus(result);
			onImported();
			return;
		}
		const key = ["not_found", "invalid"].includes(result.status) ? `chesscom.${result.status}` : `chesscom.import.${result.status}`;
		const text = t(key);
		setMessage(text === key ? t("chesscom.import.failed") : text);
	};

	return (
		<View style={[local.importBox, { borderColor: currentTheme.accent }]}>
			<Text style={[local.importTitle, { color: currentTheme.accent }]}>{t("chesscom.importTitle")}</Text>
			<Text style={[local.note, { color: currentTheme.textSecondary }]}>{t("chesscom.importSteps")}</Text>
			<Pressable
				onPress={() => {
					Clipboard.setString(code);
					setCopied(true);
				}}
				style={local.codeRow}
			>
				<Text selectable style={[local.code, { color: currentTheme.textPrimary }]}>{code}</Text>
				<Text style={[local.small, { color: currentTheme.accent }]}>{t(copied ? "chesscom.copied" : "chesscom.copy")}</Text>
			</Pressable>
			<StylizedButton text={busy ? "..." : t("chesscom.check")} onClick={() => void check()} backgroundColor="#2E9E4F" style={[local.button, { minWidth: 200 }]} textStyle={{ fontSize: 11 }} disabled={busy} />
			{message ? <Text style={local.error}>{message}</Text> : null}
		</View>
	);
}

/**
 * Links a chess.com account by its username and shows its ratings. Linking proves nothing about who owns the account,
 * so the ratings become the player's Elo here only through the code check of the import panel.
 */
export function ChessComLinkScreen({ link, onChange, onBack, onImported }: { link: ChessComLink | null; onChange: (link: ChessComLink | null) => void; onBack: () => void; onImported: () => void }) {
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
					<ImportPanel username={link.username} onImported={onImported} />
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
	importBox: { width: "100%", borderWidth: 2, borderRadius: 10, padding: 12, gap: 8, alignItems: "center", backgroundColor: "rgba(255,255,255,0.03)" },
	importTitle: { fontFamily: "SilkscreenBold", fontSize: 12, textAlign: "center" },
	codeRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: "rgba(0,0,0,0.35)" },
	code: { fontFamily: "SilkscreenBold", fontSize: 18, letterSpacing: 1 },
	error: { color: "#F87171", fontFamily: "Silkscreen", fontSize: 11, textAlign: "center" },
});
