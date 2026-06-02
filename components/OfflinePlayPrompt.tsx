import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { GameModeType } from "@/hooks/useAppState";
import { useTheme } from "@/constants/Theme";
import { cssColors } from "@/constants/Color";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";

function getModeLabel(gameMode: GameModeType): string {
	if (gameMode === GameModeType.Classic) return "Classic";
	if (gameMode === GameModeType.Chaos) return "Chaos";
	if (gameMode === GameModeType.DailyPuzzle) return "Daily Puzzle";
	return "Speed Game";
}

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

	return (
		<SimplePopupView style={[styles.popup, { backgroundColor: currentTheme.menuBackground }]}>
			<Text style={[styles.title, { color: currentTheme.textPrimary }]}>No Internet</Text>
			<Text style={[styles.message, { color: currentTheme.textSecondary }]}>
				{getModeLabel(gameMode)} can run offline. Your score will be saved and synced to the global leaderboard when internet returns.
			</Text>
			<View style={styles.buttonRow}>
				<StylizedButton
					text="Continue Offline"
					onClick={onContinue}
					backgroundColor={currentTheme.buttonPrimary}
					style={styles.button}
					textStyle={styles.buttonText}
				/>
				<StylizedButton
					text="Back"
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
