import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, StyleSheet, Text, View } from "react-native";
import StylizedButton from "./StylizedButton";
import UiIcon from "./UiIcon";
import FadeInView from "./FadeInView";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { useSoundSettings } from "@/constants/Sound";
import * as Haptics from "expo-haptics";
import { useAccountIdentity } from "@/hooks/useAccountIdentity";
import { loadShopState, useShopState } from "@/constants/Shop";
import {
	BONUS_REWARD,
	DailyQuestsView,
	claimDailyQuests,
	getDailyQuests,
	subscribeToDailyQuests,
} from "@/constants/DailyQuests";

// Today's three tasks, shown above the achievement chains. Progress is counted on the device; the coins are
// paid by the server (claim_daily_quests), so guests see the tasks but have to sign in to collect.
export default function DailyQuestsCard() {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const { signedIn } = useAccountIdentity();
	const { playSfx } = useSoundSettings();
	const { commit: commitShopState } = useShopState();
	const [view, setView] = useState<DailyQuestsView | null>(null);
	const [claiming, setClaiming] = useState(false);
	const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
	const mounted = useRef(true);

	const refresh = useCallback(async () => {
		const next = await getDailyQuests();
		if (mounted.current) setView(next);
	}, []);

	useEffect(() => {
		mounted.current = true;
		void refresh();
		const unsubscribe = subscribeToDailyQuests(() => void refresh());
		const appState = AppState.addEventListener("change", (state) => {
			if (state === "active") void refresh();
		});
		return () => {
			mounted.current = false;
			unsubscribe();
			appState.remove();
		};
	}, [refresh]);

	// The server knows what was claimed today, also from another device.
	useEffect(() => {
		if (!signedIn || !view) return;
		let cancelled = false;
		void claimDailyQuests(view.day, []).then((result) => {
			if (result && !cancelled) void refresh();
		});
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [signedIn, view?.day]);

	const claim = async () => {
		if (!view || claiming || view.claimableIds.length === 0) return;
		setClaiming(true);
		setNote(null);
		const result = await claimDailyQuests(view.day, view.claimableIds);
		setClaiming(false);
		if (!mounted.current) return;
		if (!result) {
			setNote({ text: t("ach.claimFailed"), ok: false });
			return;
		}
		if (result.coins !== null) {
			const latest = await loadShopState();
			await commitShopState({ ...latest, balance: result.coins }, []);
		}
		const paid = result.granted.reduce((sum, id) => {
			if (id === "bonus") return sum + BONUS_REWARD;
			return sum + (view.quests.find((quest) => quest.id === id)?.reward ?? 0);
		}, 0);
		setNote({ text: t("ach.claimed", { coins: paid }), ok: true });
		void playSfx("achievement");
		if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
		await refresh();
	};

	if (!view) return null;
	const doneCount = view.quests.filter((quest) => quest.complete).length;

	return (
		<View style={[styles.card, { borderColor: view.claimableIds.length > 0 ? "#4ADE80" : currentTheme.accent }]}>
			<View style={styles.headRow}>
				<Text style={[styles.title, { color: currentTheme.textPrimary }]} numberOfLines={1}>
					{t("quest.title")}
				</Text>
				<Text style={[styles.count, { color: currentTheme.accent }]}>{doneCount}/{view.quests.length}</Text>
				{view.claimableIds.length > 0 && signedIn && (
					<StylizedButton
						text={`+${view.claimableCoins}`}
						onClick={() => void claim()}
						backgroundColor="#16A34A"
						disabled={claiming}
						style={styles.claimButton}
						textStyle={styles.claimText}
					/>
				)}
			</View>
			{view.quests.map((quest, index) => {
				const percent = Math.round((quest.current / quest.target) * 100);
				return (
					<FadeInView key={quest.id} index={index} style={styles.questRow}>
						<View
							style={[
								styles.check,
								quest.claimed
									? { backgroundColor: currentTheme.accent, borderColor: currentTheme.accent }
									: quest.complete
										? { borderColor: "#4ADE80", backgroundColor: "rgba(74, 222, 128, 0.25)" }
										: { borderColor: "rgba(255, 255, 255, 0.3)" },
							]}
						/>
						<View style={styles.questText}>
							<Text style={[styles.questName, { color: quest.complete ? currentTheme.textSecondary : currentTheme.textPrimary }]} numberOfLines={2}>
								{t(`quest.${quest.kind}`, { n: quest.target })}
							</Text>
							{!quest.complete && (
								<View style={styles.track}>
									<View style={[styles.fill, { width: `${percent}%` as `${number}%`, backgroundColor: currentTheme.buttonPrimary }]} />
								</View>
							)}
						</View>
						<View style={styles.reward}>
							<UiIcon name="coin" size={12} />
							<Text style={[styles.rewardText, { color: currentTheme.accent }]}>+{quest.reward}</Text>
						</View>
					</FadeInView>
				);
			})}
			<Text style={[styles.bonus, { color: view.bonusClaimed ? currentTheme.accent : currentTheme.textSecondary }]}>
				{view.bonusClaimed ? t("quest.bonusDone") : t("quest.bonus", { coins: BONUS_REWARD })}
			</Text>
			{view.claimableIds.length > 0 && !signedIn && (
				<Text style={[styles.note, { color: currentTheme.accent }]}>{t("ach.signInToClaim", { coins: view.claimableCoins })}</Text>
			)}
			{note && <Text style={[styles.note, { color: note.ok ? "#4ADE80" : "#F87171" }]}>{note.text}</Text>}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		width: "100%",
		padding: 10,
		borderWidth: 1.5,
		borderRadius: 12,
		marginBottom: 8,
		gap: 6,
		backgroundColor: "rgba(255, 255, 255, 0.04)",
	},
	headRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	title: {
		flex: 1,
		fontFamily: "Silkscreen",
		fontSize: 13,
	},
	count: {
		fontFamily: "SilkscreenBold",
		fontSize: 13,
	},
	claimButton: {
		minWidth: 0,
		minHeight: 30,
		margin: 0,
		paddingHorizontal: 8,
	},
	claimText: {
		fontSize: 10,
	},
	questRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	check: {
		width: 14,
		height: 14,
		borderWidth: 2,
		borderRadius: 3,
	},
	questText: {
		flex: 1,
		minWidth: 0,
		gap: 4,
	},
	questName: {
		fontFamily: "Silkscreen",
		fontSize: 11,
	},
	track: {
		height: 5,
		borderRadius: 3,
		overflow: "hidden",
		backgroundColor: "rgba(255, 255, 255, 0.12)",
	},
	fill: {
		height: "100%",
		borderRadius: 3,
	},
	reward: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
	},
	rewardText: {
		fontFamily: "Silkscreen",
		fontSize: 10,
	},
	bonus: {
		fontFamily: "Silkscreen",
		fontSize: 9,
		textAlign: "center",
	},
	note: {
		fontFamily: "Silkscreen",
		fontSize: 10,
		textAlign: "center",
	},
});
