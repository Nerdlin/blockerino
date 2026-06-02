import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import { useTheme } from "@/constants/Theme";
import { cssColors } from "@/constants/Color";
import { AchievementRow, getAchievementRows } from "@/constants/Achievements";
import { useAppState } from "@/hooks/useAppState";
import { useEscapeKey } from "@/hooks/useEscapeKey";

export default function AchievementsMenu() {
	const { currentTheme } = useTheme();
	const [, , , popAppState] = useAppState();
	const { width } = useWindowDimensions();
	const isMobile = width < 600;
	const [achievements, setAchievements] = useState<AchievementRow[]>([]);
	const [loading, setLoading] = useState(true);

	const loadAchievements = async () => {
		setLoading(true);
		const rows = await getAchievementRows();
		setAchievements(rows);
		setLoading(false);
	};

	useEffect(() => {
		loadAchievements();
	}, []);

	useEscapeKey(popAppState);

	return (
		<SimplePopupView style={[
			{ backgroundColor: currentTheme.menuBackground, height: "88%" },
			isMobile && { width: "92%", height: "88%", paddingHorizontal: 8 },
		]}>
			<Text style={[styles.header, { color: currentTheme.textPrimary }]}>Achievements</Text>

			{loading ? (
				<ActivityIndicator size="large" color={currentTheme.accent} style={styles.loader} />
			) : (
				<View style={styles.list}>
					{achievements.map((achievement) => (
						<View
							key={achievement.id}
							style={[
								styles.row,
								{
									borderColor: achievement.progress.complete ? currentTheme.accent : currentTheme.textSecondary,
									backgroundColor: achievement.progress.complete ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.28)",
								},
							]}
						>
							<View style={styles.leftSide}>
								<Text style={styles.medal}>{achievement.medal}</Text>
								<View style={styles.titleBlock}>
									<Text style={[styles.title, { color: currentTheme.textPrimary }]} numberOfLines={1}>
										{achievement.title}
									</Text>
									<Text style={[styles.progress, { color: achievement.progress.complete ? currentTheme.accent : currentTheme.textSecondary }]}>
										{achievement.progress.current}/{achievement.progress.target}
									</Text>
								</View>
							</View>
							<Text style={[styles.howTo, { color: currentTheme.textSecondary }]}>
								{achievement.howToUnlock}
							</Text>
						</View>
					))}
				</View>
			)}

			<View style={styles.buttons}>
				<StylizedButton
					text="Refresh"
					onClick={loadAchievements}
					backgroundColor={currentTheme.buttonPrimary}
					style={styles.button}
					textStyle={styles.buttonText}
				/>
				<StylizedButton
					text="Back"
					onClick={popAppState}
					backgroundColor={cssColors.spaceGray}
					style={styles.button}
					textStyle={styles.buttonText}
				/>
			</View>
		</SimplePopupView>
	);
}

const styles = StyleSheet.create({
	header: {
		fontFamily: "Silkscreen",
		fontSize: 24,
		textAlign: "center",
		marginBottom: 12,
	},
	loader: {
		marginVertical: 30,
	},
	list: {
		width: "100%",
		gap: 6,
	},
	row: {
		width: "100%",
		minHeight: 56,
		borderWidth: 1,
		borderRadius: 6,
		paddingVertical: 6,
		paddingHorizontal: 8,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 10,
	},
	leftSide: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		minWidth: 0,
	},
	medal: {
		fontSize: 21,
		width: 30,
		textAlign: "center",
	},
	titleBlock: {
		flex: 1,
		minWidth: 0,
	},
	title: {
		fontFamily: "Silkscreen",
		fontSize: 11,
	},
	progress: {
		fontFamily: "Silkscreen",
		fontSize: 9,
		marginTop: 2,
	},
	howTo: {
		flex: 1,
		fontFamily: "Silkscreen",
		fontSize: 9,
		lineHeight: 12,
		textAlign: "right",
	},
	buttons: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "center",
		gap: 8,
		marginTop: 12,
	},
	button: {
		minWidth: 130,
	},
	buttonText: {
		fontSize: 14,
	},
});
