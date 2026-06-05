import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { checkSupabaseConnectionDetails } from "@/constants/Connectivity";
import type { SupabaseConnectionResult } from "@/constants/Connectivity";
import { useTheme } from "@/constants/Theme";
import { cssColors } from "@/constants/Color";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";

export default function MultiplayerConnectionGate({
	onConnected,
	onBack,
}: {
	onConnected: () => void;
	onBack: () => void;
}) {
	const { currentTheme } = useTheme();
	const mountedRef = useRef(true);
	const [checking, setChecking] = useState(true);
	const [lastChecked, setLastChecked] = useState<number | null>(null);
	const [connectionResult, setConnectionResult] = useState<SupabaseConnectionResult | null>(null);

	const checkConnection = useCallback(async () => {
		setChecking(true);
		const result = await checkSupabaseConnectionDetails();

		if (!mountedRef.current) return;
		setLastChecked(Date.now());
		setConnectionResult(result);
		setChecking(false);

		if (result.online) {
			onConnected();
		}
	}, [onConnected]);

	useEffect(() => {
		mountedRef.current = true;
		checkConnection();

		return () => {
			mountedRef.current = false;
		};
	}, [checkConnection]);

	return (
		<SimplePopupView style={[styles.popup, { backgroundColor: currentTheme.menuBackground }]}>
			<Text style={[styles.title, { color: currentTheme.textPrimary }]}>Online Required</Text>
			<Text style={[styles.message, { color: currentTheme.textSecondary }]}>
				Multiplayer, rooms, ELO rating, and ELO leaderboard need an internet connection.
			</Text>

			{checking && (
				<View style={styles.checkingContainer}>
					<ActivityIndicator size="large" color={currentTheme.accent} />
					<Text style={[styles.status, { color: currentTheme.textSecondary }]}>Checking connection...</Text>
				</View>
			)}

			{!checking && (
				<View style={styles.statusBlock}>
					<Text style={[styles.status, { color: currentTheme.textSecondary }]}>
						{lastChecked ? "Connection check failed." : "No connection detected."}
					</Text>
					{connectionResult?.message && (
						<Text style={[styles.detail, { color: currentTheme.textSecondary }]}>
							{connectionResult.code ? `${connectionResult.code}: ` : ""}{connectionResult.message}
						</Text>
					)}
				</View>
			)}

			<View style={styles.buttonRow}>
				<StylizedButton
					text="Check Connection"
					onClick={checkConnection}
					backgroundColor={currentTheme.buttonPrimary}
					disabled={checking}
					style={styles.button}
					textStyle={styles.buttonText}
				/>
				<StylizedButton
					text="Back"
					onClick={onBack}
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
		minHeight: 300,
		maxHeight: 420,
	},
	title: {
		fontFamily: "Silkscreen",
		fontSize: 26,
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
	checkingContainer: {
		alignItems: "center",
		gap: 10,
		marginBottom: 12,
	},
	status: {
		fontFamily: "Silkscreen",
		fontSize: 12,
		lineHeight: 18,
		textAlign: "center",
	},
	statusBlock: {
		width: "100%",
		alignItems: "center",
		marginBottom: 16,
		gap: 6,
	},
	detail: {
		fontFamily: "Silkscreen",
		fontSize: 9,
		lineHeight: 13,
		textAlign: "center",
		paddingHorizontal: 8,
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
