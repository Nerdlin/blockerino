import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Platform, StyleSheet, Text, View, useWindowDimensions, Pressable } from "react-native";
import SimplePopupView from "./SimplePopupView";
import AchievementIcon from "./AchievementIcon";
import StylizedButton from "./StylizedButton";
import UiIcon from "./UiIcon";
import { useTheme } from "@/constants/Theme";
import { cssColors } from "@/constants/Color";
import {
	AchievementRow,
	getAchievementRows,
	subscribeToAchievementProgress,
	subscribeToAchievementUnlocks,
} from "@/constants/Achievements";
import { useAppState } from "@/hooks/useAppState";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useShopState } from "@/constants/Shop";
import { useLanguage } from "@/constants/Localization";

export default function AchievementsMenu() {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const [, , , popAppState] = useAppState();
	const { width } = useWindowDimensions();
	const isMobile = width < 600;
	const [achievements, setAchievements] = useState<AchievementRow[]>([]);
	const [loading, setLoading] = useState(true);
	const completedCount = useMemo(
		() => achievements.filter((achievement) => achievement.progress.complete).length,
		[achievements]
	);

	// Closest to done first, then not started, finished ones at the bottom.
	const sorted = useMemo(() => {
		const rank = (a: AchievementRow) => a.progress.complete ? 2 : a.progress.current > 0 ? 0 : 1;
		const ratio = (a: AchievementRow) => a.progress.current / Math.max(1, a.progress.target);
		return [...achievements].sort((a, b) => rank(a) - rank(b) || (rank(a) === 0 ? ratio(b) - ratio(a) : 0));
	}, [achievements]);

	// Secret states
	const [firstStepsClicks, setFirstStepsClicks] = useState(0);
	const [secretMessage, setSecretMessage] = useState<string | null>(null);
	const { state: shopState, commit: commitShopState } = useShopState();

	const handleAchievementClick = async (id: string) => {
		if (id === "first_steps") {
			if (shopState.ownedItemIds.includes("sfx_custom")) return;

			const newClicks = firstStepsClicks + 1;
			setFirstStepsClicks(newClicks);

			if (newClicks === 7) {
				setSecretMessage("SECRET UNLOCKED: Custom SFX URL in Shop!");
				const newState = {
					...shopState,
					ownedItemIds: [...shopState.ownedItemIds, "sfx_custom"]
				};
				await commitShopState(newState);
			} else if (newClicks >= 3) {
				setSecretMessage(`${7 - newClicks} clicks remaining...`);
			}
		}
	};

	const isMountedRef = useRef(true);
	const hasLoadedRef = useRef(false);

	// `silent` refreshes keep the current list on screen instead of showing the spinner.
	const loadAchievements = useCallback(async (silent = false) => {
		if (!silent || !hasLoadedRef.current) setLoading(true);
		const rows = await getAchievementRows();
		if (!isMountedRef.current) return;
		hasLoadedRef.current = true;
		setAchievements(rows);
		setLoading(false);
	}, []);

	useEffect(() => {
		isMountedRef.current = true;
		void loadAchievements();

		// Refresh by itself when progress changes, an achievement unlocks, or the app comes back to the foreground.
		const refresh = () => void loadAchievements(true);
		const unsubscribeProgress = subscribeToAchievementProgress(refresh);
		const unsubscribeUnlocks = subscribeToAchievementUnlocks(refresh);
		const appStateSubscription = AppState.addEventListener("change", (state) => {
			if (state === "active") refresh();
		});

		return () => {
			isMountedRef.current = false;
			unsubscribeProgress();
			unsubscribeUnlocks();
			appStateSubscription.remove();
		};
	}, [loadAchievements]);

	useEscapeKey(popAppState);

	return (
		<SimplePopupView style={[
			{ backgroundColor: currentTheme.menuBackground, height: "80%" },
			isMobile && { width: "92%", height: "88%", paddingHorizontal: 8 },
		]}>
			<View style={styles.topBar}>
				<StylizedButton
					text={t("ach.back")}
					onClick={popAppState}
					backgroundColor={cssColors.spaceGray}
					style={styles.backButton}
					textStyle={styles.buttonText}
				/>
				<Text style={[styles.header, { color: currentTheme.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{t("ach.header")}</Text>
				<Pressable
					onPress={() => void loadAchievements()}
					accessibilityLabel={t("ach.refresh")}
					style={styles.refreshIcon}
				>
					<UiIcon name="refresh" size={18} />
				</Pressable>
			</View>
			{!loading && (
				<View style={[styles.summaryCard, { borderColor: currentTheme.accent }]}>
					<UiIcon name="medalGold" size={36} />
					<View style={styles.summaryText}>
						<Text style={[styles.summaryCount, { color: currentTheme.accent }]}>
							{completedCount} / {achievements.length}
						</Text>
						<View style={styles.progressTrack}>
							<View
								style={[
									styles.progressFill,
									{
										width: `${achievements.length ? Math.round((completedCount / achievements.length) * 100) : 0}%` as `${number}%`,
										backgroundColor: currentTheme.accent,
									},
								]}
							/>
						</View>
					</View>
				</View>
			)}
			{secretMessage && (
				<Text style={{ fontFamily: 'Silkscreen', fontSize: 12, color: '#FFD700', marginBottom: 10, textAlign: 'center' }}>
					{secretMessage}
				</Text>
			)}

			{loading ? (
				<ActivityIndicator size="large" color={currentTheme.accent} style={styles.loader} />
			) : (
				<View style={styles.list}>
					{sorted.map((achievement) => {
						const done = achievement.progress.complete;
						const progressPercent = Math.min(100, Math.round((achievement.progress.current / achievement.progress.target) * 100));
						const progressWidth = `${progressPercent}%` as `${number}%`;

						return (
							<Pressable
								key={achievement.id}
								onPress={() => handleAchievementClick(achievement.id)}
								style={[
									styles.row,
									{
										borderColor: done ? currentTheme.accent : "rgba(255, 255, 255, 0.16)",
										backgroundColor: done ? "rgba(240, 175, 12, 0.10)" : "rgba(255, 255, 255, 0.04)",
									},
								]}
							>
								<View
									style={[
										styles.medalBadge,
										{
											borderColor: done ? currentTheme.accent : "rgba(255, 255, 255, 0.2)",
											backgroundColor: done ? "rgba(240, 175, 12, 0.16)" : "rgba(0, 0, 0, 0.35)",
										},
									]}
								>
									<AchievementIcon achievementId={achievement.id} size={27} dimmed={!done} />
								</View>
								<View style={styles.titleBlock}>
									<View style={styles.titleLine}>
										<Text style={[styles.title, { color: currentTheme.textPrimary }]} numberOfLines={1}>
											{t(`ach.${achievement.id}.title`)}
										</Text>
										<Text style={[styles.progress, { color: done ? currentTheme.accent : currentTheme.textSecondary }]}>
											{done ? "✓" : `${achievement.progress.current}/${achievement.progress.target}`}
										</Text>
									</View>
									<Text style={[styles.howTo, { color: currentTheme.textSecondary }]} numberOfLines={2}>
										{t(`ach.${achievement.id}.unlock`)}
									</Text>
									{!done && (
										<View style={styles.progressTrack}>
											<View style={[styles.progressFill, { width: progressWidth, backgroundColor: currentTheme.buttonPrimary }]} />
										</View>
									)}
								</View>
							</Pressable>
						);
					})}
				</View>
			)}

		</SimplePopupView>
	);
}

const styles = StyleSheet.create({
	topBar: {
		width: "100%",
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
		marginBottom: 10,
	},
	backButton: {
		width: 80,
		minWidth: 80,
	},
	refreshIcon: {
		width: 44,
		height: 44,
		borderRadius: 10,
		borderWidth: 2,
		borderColor: "rgba(255, 255, 255, 0.25)",
		alignItems: "center",
		justifyContent: "center",
	},
	header: {
		flex: 1,
		minWidth: 0,
		fontFamily: "Silkscreen",
		fontSize: 16,
		textAlign: "center",
	},
	summaryCard: {
		width: "100%",
		flexDirection: "row",
		alignItems: "center",
		gap: 14,
		padding: 12,
		borderWidth: 1.5,
		borderRadius: 12,
		marginBottom: 12,
		backgroundColor: "rgba(240, 175, 12, 0.08)",
	},
	summaryText: {
		flex: 1,
		gap: 8,
	},
	summaryCount: {
		fontFamily: "SilkscreenBold",
		fontSize: 20,
	},
	titleLine: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
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
		borderWidth: 1.5,
		borderRadius: 12,
		paddingVertical: 10,
		paddingHorizontal: 10,
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
	medalBadge: {
		width: 44,
		height: 44,
		borderRadius: 10,
		borderWidth: 1.5,
		alignItems: "center",
		justifyContent: "center",
	},
	titleBlock: {
		flex: 1,
		minWidth: 0,
	},
	title: {
		flex: 1,
		fontFamily: "SilkscreenBold",
		fontSize: 12,
	},
	progress: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		textAlign: "right",
	},
	progressTrack: {
		width: "100%",
		height: 8,
		borderRadius: 4,
		marginTop: 6,
		overflow: "hidden",
		backgroundColor: "rgba(255, 255, 255, 0.10)",
	},
	progressFill: {
		height: "100%",
		borderRadius: 4,
	},
	howTo: {
		fontFamily: "Silkscreen",
		fontSize: 9,
		lineHeight: 12,
		marginTop: 2,
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
