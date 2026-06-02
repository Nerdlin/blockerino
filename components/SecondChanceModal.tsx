import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import { useTheme } from "@/constants/Theme";
import { cssColors } from "@/constants/Color";
import { SECOND_CHANCE_DECISION_SECONDS } from "@/constants/SecondChance";

export default function SecondChanceModal({
	cost,
	currentScore,
	chancesRemaining,
	reason,
	onAccept,
	onDecline,
}: {
	cost: number;
	currentScore: number;
	chancesRemaining: number;
	reason: "moves" | "time";
	onAccept: () => void;
	onDecline: () => void;
}) {
	const { currentTheme } = useTheme();
	const [secondsLeft, setSecondsLeft] = useState(SECOND_CHANCE_DECISION_SECONDS);
	const notEnoughPoints = currentScore < cost;

	useEffect(() => {
		setSecondsLeft(SECOND_CHANCE_DECISION_SECONDS);
	}, [cost]);

	useEffect(() => {
		if (secondsLeft <= 0) {
			onDecline();
			return;
		}

		const timer = setTimeout(() => {
			setSecondsLeft((value) => value - 1);
		}, 1000);

		return () => clearTimeout(timer);
	}, [onDecline, secondsLeft]);

	return (
		<SimplePopupView style={[styles.popup, { backgroundColor: currentTheme.menuBackground }]}>
			<Text style={[styles.title, { color: currentTheme.buttonPrimary }]}>Extra Chance?</Text>
			<Text style={[styles.timer, { color: currentTheme.accent }]}>{secondsLeft}s</Text>
			<Text style={[styles.message, { color: currentTheme.textSecondary }]}>
				{reason === "time" ? "Time ran out." : "No moves left."}
			</Text>
			<Text style={[styles.cost, { color: notEnoughPoints ? cssColors.brightNiceRed : currentTheme.textSecondary }]}>-{cost} points</Text>
			{notEnoughPoints && (
				<Text style={[styles.message, { color: cssColors.brightNiceRed, marginTop: 4 }]}>
					Not enough points!
				</Text>
			)}
			<Text style={[styles.remaining, { color: currentTheme.textSecondary }]}>
				Chances left: {chancesRemaining}
			</Text>

			<View style={styles.buttons}>
				<StylizedButton
					text="Continue"
					onClick={onAccept}
					backgroundColor={currentTheme.buttonPrimary}
					disabled={notEnoughPoints}
					style={styles.button}
					textStyle={styles.buttonText}
				/>
				<StylizedButton
					text="No"
					onClick={onDecline}
					backgroundColor={currentTheme.buttonSecondary}
					style={styles.button}
					textStyle={styles.buttonText}
				/>
			</View>
		</SimplePopupView>
	);
}

const styles = StyleSheet.create({
	popup: {
		height: "auto",
		maxHeight: 440,
	},
	title: {
		fontFamily: "Silkscreen",
		fontSize: 30,
		textAlign: "center",
		marginBottom: 12,
	},
	timer: {
		fontFamily: "Silkscreen",
		fontSize: 42,
		textAlign: "center",
		marginBottom: 12,
	},
	message: {
		fontFamily: "Silkscreen",
		fontSize: 16,
		textAlign: "center",
		marginBottom: 10,
	},
	cost: {
		fontFamily: "Silkscreen",
		fontSize: 20,
		textAlign: "center",
		marginBottom: 8,
	},
	remaining: {
		fontFamily: "Silkscreen",
		fontSize: 12,
		textAlign: "center",
		marginBottom: 18,
	},
	buttons: {
		width: "100%",
		alignItems: "center",
		gap: 8,
	},
	button: {
		minWidth: 180,
	},
	buttonText: {
		fontSize: 15,
	},
});
