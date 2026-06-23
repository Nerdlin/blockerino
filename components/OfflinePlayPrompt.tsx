import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { GameModeType } from "@/hooks/useAppState";
import { useTheme } from "@/constants/Theme";
import { cssColors } from "@/constants/Color";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import { getGameModeConfig } from "@/constants/GameModes";
import { useLanguage } from "@/constants/Localization";

export default function OfflinePlayPrompt({
	gameMode,
	onContinue,
	onCancel,
}: {
	gameMode: GameModeType;
	onContinue: () => void;
	onCancel: () => void;
}) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();

	return (
		<SimplePopupView style={[styles.popup, { backgroundColor: currentTheme.menuBackground }]}>
			<Text style={[styles.title, { color: currentTheme.textPrimary }]}>{t("over.noInternet")}</Text>
			<Text style={[styles.message, { color: currentTheme.textSecondary }]}>
				{t("over.offlineMessage", { mode: getGameModeConfig(gameMode).title })}
			</Text>
			<View style={styles.buttonRow}>
				<StylizedButton
					text={t("over.continueOffline")}
					onClick={onContinue}
					backgroundColor={currentTheme.buttonPrimary}
					style={styles.button}
					textStyle={styles.buttonText}
				/>
				<StylizedButton
					text={t("over.back")}
					onClick={onCancel}
					backgroundColor={cssColors.spaceGray}
					style={styles.button}
					textStyle={styles.buttonText}
				/>
			</View>
		</SimplePopupView>
	);
}

const styles = StyleSheet.create({
	popup: {
		width: "88%",
		height: "auto",
		minHeight: 240,
		maxHeight: 360,
	},
	title: {
		fontFamily: "Silkscreen",
		fontSize: 28,
		textAlign: "center",
		marginBottom: 18,
	},
	message: {
		fontFamily: "Silkscreen",
		fontSize: 14,
		lineHeight: 20,
		textAlign: "center",
		marginBottom: 20,
	},
	buttonRow: {
		width: "100%",
		alignItems: "center",
		gap: 8,
	},
	button: {
		width: "85%",
		maxWidth: 280,
	},
	buttonText: {
		fontSize: 14,
	},
});
