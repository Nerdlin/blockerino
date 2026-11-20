import { useEffect, useRef, useState } from "react";
import { Animated, Easing, ScrollView, StyleSheet, Text, View } from "react-native";
import StylizedButton from "./StylizedButton";
import UiIcon from "./UiIcon";
import FadeInView from "./FadeInView";
import { SectionLabel, withAlpha } from "./ProfileDesign";
import { formatSeasonKey } from "./SeasonTitleBadges";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { useSoundSettings } from "@/constants/Sound";
import { buzz } from "@/constants/Haptic";
import { loadShopState, useShopState } from "@/constants/Shop";
import { useAccountIdentity } from "@/hooks/useAccountIdentity";
import { celebrate } from "@/constants/Celebration";
import { claimMonthlyQuest, daysLeftInMonth, monthlyGoal, useMonthlyQuest, type MonthlyMilestone } from "@/constants/MonthlyQuest";

const PINK = "#D946A8";
const GOLD = "#FBBF24";

/** A bar that fills up to its share, with a tick at every step; the number sits on it like in the quests of Duolingo. */
function FillBar({ fraction, label, ticks }: { fraction: number; label: string; ticks: number[] }) {
	const progress = useRef(new Animated.Value(0)).current;
	useEffect(() => {
		const animation = Animated.timing(progress, { toValue: Math.max(0, Math.min(1, fraction)), duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false });
		animation.start();
		return () => animation.stop();
	}, [progress, fraction]);
	return (
		<View style={styles.barTrack}>
			<Animated.View style={[styles.barFill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
			{ticks.map((tick) => (
				<View key={tick} style={[styles.tick, { left: `${tick * 100}%` }]} />
			))}
			<Text style={styles.barText}>{label}</Text>
		</View>
	);
}

/** One step: its days, what it pays and a button once it is reached. */
function MilestoneRow({ step, done, busy, onClaim }: { step: MonthlyMilestone; done: number; busy: boolean; onClaim: () => void }) {
	const { t } = useLanguage();
	const { currentTheme } = useTheme();
	const reached = done >= step.days;
	return (
		<View style={[styles.stepRow, step.claimed && { opacity: 0.6 }]}>
			<View style={[styles.stepIcon, { borderColor: reached ? GOLD : "rgba(255,255,255,0.2)", backgroundColor: withAlpha(reached ? GOLD : "#FFFFFF", 0.1) }]}>
				<UiIcon name={step.medal ? "medalGold" : "gift"} size={27} dimmed={!reached} />
			</View>
			<View style={styles.stepText}>
				<Text style={[styles.stepTitle, { color: currentTheme.textPrimary }]} numberOfLines={1}>{t("monthly.step", { days: step.days })}</Text>
				<View style={styles.rewardLine}>
					<UiIcon name="coin" size={14} />
					<Text style={[styles.stepReward, { color: "#FFD700" }]}>+{step.coins}</Text>
					<UiIcon name="key" size={14} />
					<Text style={[styles.stepReward, { color: currentTheme.textPrimary }]}>x{step.keys}</Text>
				</View>
				{step.medal ? <Text style={styles.stepMedal} numberOfLines={1}>+ {t("monthly.plusMedal")}</Text> : null}
			</View>
			{step.claimed ? (
				<Text style={styles.stepDone}>✓</Text>
			) : reached ? (
				<StylizedButton text={t("monthly.take")} onClick={onClaim} backgroundColor="#16A34A" disabled={busy} style={styles.stepButton} textStyle={styles.stepButtonText} />
			) : (
				<Text style={[styles.stepLeft, { color: currentTheme.textSecondary }]}>{t("monthly.left", { days: step.days - done })}</Text>
			)}
		</View>
	);
}

/** This month's quest: the daily bonus on 10 and on 20 days, a pink card with a step list. Signed-in players only. */
export default function MonthlyQuestCard() {
	const { t } = useLanguage();
	const { currentTheme } = useTheme();
	const { signedIn } = useAccountIdentity();
	const { playSfx } = useSoundSettings();
	const { commit: commitShopState } = useShopState();
	const { state, set } = useMonthlyQuest();
	const [claiming, setClaiming] = useState(false);
	const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);

	if (!signedIn || !state) return null;
	const goal = monthlyGoal(state);
	const days = daysLeftInMonth(state);
	const medalOwned = state.medals.includes(state.month);

	const claim = async (step: MonthlyMilestone) => {
		if (claiming) return;
		setClaiming(true);
		setNote(null);
		const result = await claimMonthlyQuest(step.index);
		setClaiming(false);
		if (result.status === "ok" || result.status === "already") {
			if (result.state) set(result.state);
			if (result.status === "ok") {
				if (result.wallet !== null) {
					const latest = await loadShopState();
					await commitShopState({ ...latest, balance: result.wallet }, []);
				}
				setNote({ text: t("monthly.claimed", { coins: result.coins }), ok: true });
				void playSfx("achievement");
				buzz("success");
				celebrate({
					id: `monthly:${state.month}:${step.index}`,
					icon: result.medal ? "medalGold" : "gift",
					accent: result.medal ? "#F472B6" : GOLD,
					title: t(result.medal ? "celebrate.monthlyTitle" : "celebrate.monthlyStepTitle", { days: step.days }),
					subtitle: formatSeasonKey(state.month, t, true),
					coins: result.coins,
					lines: result.keys > 0 ? [t("pass.reward.keys", { count: result.keys })] : [],
				});
			}
			return;
		}
		setNote({ text: t("ach.claimFailed"), ok: false });
	};

	return (
		<FadeInView style={[styles.card, { backgroundColor: PINK }]}>
			<View style={styles.head}>
				<View style={styles.headText}>
					<Text style={styles.title} numberOfLines={1}>{t("monthly.title", { month: formatSeasonKey(state.month, t, true) })}</Text>
					<Text style={styles.sub}>{t("monthly.daysLeft", { days })}</Text>
				</View>
				<View style={[styles.medal, { opacity: medalOwned ? 1 : 0.55 }]}>
					<UiIcon name="medalGold" size={36} dimmed={!medalOwned} />
				</View>
			</View>
			<View style={[styles.inner, { backgroundColor: currentTheme.menuBackground }]}>
				<Text style={[styles.goal, { color: currentTheme.textPrimary }]}>{t("monthly.goal")}</Text>
				<FillBar fraction={state.done / goal} label={`${Math.min(state.done, goal)} / ${goal}`} ticks={state.milestones.filter((step) => step.days < goal).map((step) => step.days / goal)} />
				{state.milestones.map((step) => (
					<MilestoneRow key={step.index} step={step} done={state.done} busy={claiming} onClaim={() => void claim(step)} />
				))}
				{note ? <Text style={[styles.note, { color: note.ok ? "#4ADE80" : "#F87171" }]}>{note.text}</Text> : null}
			</View>
		</FadeInView>
	);
}

/** The collection of monthly medals on the profile, a row of medals like the season titles. */
export function MonthlyMedalsRow({ medals }: { medals: string[] }) {
	const { t } = useLanguage();
	const { currentTheme } = useTheme();
	if (medals.length === 0) return null;
	return (
		<View style={styles.medalsWrap}>
			<SectionLabel>{t("monthly.medals")}</SectionLabel>
			<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.medalsRow}>
				{medals.map((month, index) => (
					<FadeInView key={month} index={index} pop style={styles.medalItem}>
						<View style={[styles.medalFrame, { borderColor: PINK, backgroundColor: withAlpha(PINK, 0.16) }]}>
							<UiIcon name="medalGold" size={30} />
						</View>
						<Text style={[styles.medalMonth, { color: currentTheme.textPrimary }]} numberOfLines={1}>{formatSeasonKey(month, t)}</Text>
					</FadeInView>
				))}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		width: "100%",
		borderRadius: 14,
		padding: 10,
		marginBottom: 10,
		gap: 8,
	},
	head: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 4,
	},
	headText: {
		flex: 1,
		gap: 2,
	},
	title: {
		fontFamily: "SilkscreenBold",
		fontSize: 15,
		color: "#FFFFFF",
	},
	sub: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		color: "rgba(255,255,255,0.82)",
	},
	medal: {
		width: 52,
		height: 52,
		borderRadius: 26,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(0,0,0,0.22)",
	},
	inner: {
		borderRadius: 12,
		padding: 12,
		gap: 10,
	},
	goal: {
		fontFamily: "SilkscreenBold",
		fontSize: 12,
	},
	barTrack: {
		height: 22,
		borderRadius: 11,
		overflow: "hidden",
		backgroundColor: "rgba(255,255,255,0.1)",
		justifyContent: "center",
	},
	barFill: {
		position: "absolute",
		left: 0,
		top: 0,
		bottom: 0,
		borderRadius: 11,
		backgroundColor: PINK,
	},
	tick: {
		position: "absolute",
		top: 0,
		bottom: 0,
		width: 2,
		backgroundColor: "rgba(255,255,255,0.55)",
	},
	barText: {
		textAlign: "center",
		fontFamily: "SilkscreenBold",
		fontSize: 11,
		color: "#FFFFFF",
	},
	stepRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	stepIcon: {
		width: 44,
		height: 44,
		borderRadius: 12,
		borderWidth: 2,
		borderBottomWidth: 4,
		alignItems: "center",
		justifyContent: "center",
	},
	stepText: {
		flex: 1,
		gap: 1,
	},
	stepTitle: {
		fontFamily: "SilkscreenBold",
		fontSize: 12,
	},
	stepReward: {
		fontFamily: "Silkscreen",
		fontSize: 10,
	},
	rewardLine: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
	},
	stepMedal: {
		fontFamily: "SilkscreenBold",
		fontSize: 10,
		color: "#F472B6",
	},
	stepButton: {
		minWidth: 0,
		margin: 0,
		minHeight: 34,
		paddingHorizontal: 12,
	},
	stepButtonText: {
		fontSize: 12,
	},
	stepDone: {
		fontFamily: "SilkscreenBold",
		fontSize: 18,
		color: "#4ADE80",
		width: 40,
		textAlign: "center",
	},
	stepLeft: {
		fontFamily: "Silkscreen",
		fontSize: 10,
		width: 62,
		textAlign: "right",
	},
	note: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		textAlign: "center",
	},
	medalsWrap: {
		width: "100%",
		gap: 10,
		marginTop: 4,
		marginBottom: 6,
	},
	medalsRow: {
		gap: 12,
	},
	medalItem: {
		width: 78,
		alignItems: "center",
		gap: 4,
	},
	medalFrame: {
		width: 62,
		height: 62,
		borderRadius: 31,
		borderWidth: 2,
		borderBottomWidth: 5,
		alignItems: "center",
		justifyContent: "center",
	},
	medalMonth: {
		fontFamily: "Silkscreen",
		fontSize: 10,
	},
});
