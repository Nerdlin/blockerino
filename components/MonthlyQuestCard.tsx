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
import { claimMonthlyQuest, daysLeftInMonth, isFullMonthStep, monthTheme, monthlyGoal, useMonthlyQuest, type MonthTheme, type MonthlyMilestone } from "@/constants/MonthlyQuest";

const GOLD = "#FBBF24";

/** A bar that fills up to its share, with a tick at every step; the number sits on it like in the quests of Duolingo. */
function FillBar({ fraction, label, ticks, theme }: { fraction: number; label: string; ticks: number[]; theme: MonthTheme }) {
	const progress = useRef(new Animated.Value(0)).current;
	useEffect(() => {
		const animation = Animated.timing(progress, { toValue: Math.max(0, Math.min(1, fraction)), duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false });
		animation.start();
		return () => animation.stop();
	}, [progress, fraction]);
	return (
		<View style={styles.barTrack}>
			<Animated.View style={[styles.barFill, { backgroundColor: theme.via, experimental_backgroundImage: `linear-gradient(180deg, ${theme.from} 0%, ${theme.via} 55%, ${theme.to} 100%)`, width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
			{ticks.map((tick) => (
				<View key={tick} style={[styles.tick, { left: `${tick * 100}%` }]} />
			))}
			<Text style={styles.barText}>{label}</Text>
		</View>
	);
}

/** One drifting pixel of the season: snow, leaves, petals, sparks. It falls (or rises, for sparks) and sways. */
function Drift({ index, theme, width, height }: { index: number; theme: MonthTheme; width: number; height: number }) {
	const run = useRef(new Animated.Value(0)).current;
	const spec = useRef(
		(() => {
			const seed = (index * 7919 + 104729) % 100000;
			const r = (k: number) => ((seed * (k + 5)) % 1000) / 1000;
			const snow = theme.particles === "snow";
			return {
				left: r(1) * Math.max(10, width - 8),
				size: snow ? 3 + Math.round(r(2)) * 2 : 4 + Math.round(r(2) * 2) * 2,
				delay: Math.round(r(3) * 3000),
				duration: (snow ? 5200 : 4200) + Math.round(r(4) * 3000),
				color: theme.particleColors[index % theme.particleColors.length],
				up: theme.particles === "spark" || theme.particles === "ember" || theme.particles === "pollen",
				sway: 6 + Math.round(r(5) * 10),
			};
		})()
	).current;
	useEffect(() => {
		const loop = Animated.loop(Animated.timing(run, { toValue: 1, duration: spec.duration, delay: spec.delay, easing: Easing.linear, useNativeDriver: true }));
		loop.start();
		return () => loop.stop();
	}, [run, spec]);
	return (
		<Animated.View
			pointerEvents="none"
			style={{
				position: "absolute",
				left: spec.left,
				top: 0,
				width: spec.size,
				height: spec.size,
				backgroundColor: spec.color,
				opacity: run.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 0.9, 0.9, 0] }),
				transform: [
					{ translateY: run.interpolate({ inputRange: [0, 1], outputRange: spec.up ? [height, -10] : [-10, height] }) },
					{ translateX: run.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, spec.sway, 0] }) },
					{ rotate: run.interpolate({ inputRange: [0, 1], outputRange: ["0deg", spec.up ? "0deg" : "180deg"] }) },
				],
			}}
		/>
	);
}

/** One step: its days, what it pays and a button once it is reached. */
function MilestoneRow({ step, done, busy, onClaim, full, theme }: { step: MonthlyMilestone; done: number; busy: boolean; onClaim: () => void; full: boolean; theme: MonthTheme }) {
	const { t } = useLanguage();
	const { currentTheme } = useTheme();
	const reached = done >= step.days;
	return (
		<View style={[styles.stepRow, step.claimed && { opacity: 0.6 }]}>
			<View style={[styles.stepIcon, { borderColor: reached ? theme.accent : "rgba(255,255,255,0.2)", backgroundColor: withAlpha(reached ? theme.accent : "#FFFFFF", 0.12) }]}>
				<UiIcon name={step.medal ? "medalGold" : full ? "crown" : "gift"} size={27} dimmed={!reached} />
			</View>
			<View style={styles.stepText}>
				<Text style={[styles.stepTitle, { color: currentTheme.textPrimary }]} numberOfLines={1}>{full ? t("monthly.stepFull", { days: step.days }) : t("monthly.step", { days: step.days })}</Text>
				<View style={styles.rewardLine}>
					<UiIcon name="coin" size={14} />
					<Text style={[styles.stepReward, { color: "#FFD700" }]}>+{step.coins}</Text>
					<UiIcon name="key" size={14} />
					<Text style={[styles.stepReward, { color: currentTheme.textPrimary }]}>x{step.keys}</Text>
				</View>
				{step.medal ? <Text style={[styles.stepMedal, { color: theme.accent }]} numberOfLines={1}>+ {t("monthly.plusMedal")}</Text> : null}
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
	const theme = monthTheme(state.month);
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
				const fullStep = isFullMonthStep(step, state.month);
				celebrate({
					id: `monthly:${state.month}:${step.index}`,
					icon: result.medal ? "medalGold" : fullStep ? "crown" : "gift",
					accent: theme.accent,
					title: t(result.medal ? "celebrate.monthlyTitle" : fullStep ? "celebrate.monthlyFullTitle" : "celebrate.monthlyStepTitle", { days: step.days }),
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
		<FadeInView style={[styles.card, { borderColor: theme.edge, backgroundColor: theme.via, experimental_backgroundImage: `linear-gradient(160deg, ${theme.from} 0%, ${theme.via} 48%, ${theme.to} 100%)` }]}>
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
				<FillBar theme={theme} fraction={state.done / goal} label={`${Math.min(state.done, goal)} / ${goal}`} ticks={state.milestones.filter((step) => step.days < goal).map((step) => step.days / goal)} />
				{state.milestones.map((step) => (
					<MilestoneRow key={step.index} step={step} done={state.done} busy={claiming} onClaim={() => void claim(step)} full={isFullMonthStep(step, state.month)} theme={theme} />
				))}
				{note ? <Text style={[styles.note, { color: note.ok ? "#4ADE80" : "#F87171" }]}>{note.text}</Text> : null}
			</View>
			<View style={styles.particles} pointerEvents="none">
				{Array.from({ length: theme.particles === "snow" ? 16 : 10 }, (_, i) => (
					<Drift key={i} index={i} theme={theme} width={320} height={300} />
				))}
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
						<View style={[styles.medalFrame, { borderColor: monthTheme(month).via, backgroundColor: withAlpha(monthTheme(month).via, 0.18) }]}>
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
		borderRadius: 16,
		borderBottomWidth: 5,
		overflow: "hidden",
		padding: 10,
		marginBottom: 10,
		gap: 8,
	},
	particles: {
		...StyleSheet.absoluteFillObject,
		zIndex: 5,
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
		color: "#FBBF24",
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
