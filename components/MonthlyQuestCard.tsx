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
import { claimMonthlyQuest, daysLeftInMonth, useMonthlyQuest } from "@/constants/MonthlyQuest";

const PINK = "#D946A8";

/** A bar that fills up to its share; the number sits on it like in the daily quests of Duolingo. */
function FillBar({ fraction, label }: { fraction: number; label: string }) {
	const progress = useRef(new Animated.Value(0)).current;
	useEffect(() => {
		const animation = Animated.timing(progress, { toValue: Math.max(0, Math.min(1, fraction)), duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false });
		animation.start();
		return () => animation.stop();
	}, [progress, fraction]);
	return (
		<View style={styles.barTrack}>
			<Animated.View style={[styles.barFill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
			<Text style={styles.barText}>{label}</Text>
		</View>
	);
}

/** This month's quest: the daily bonus on N days, a pink card with the medal at the end. Signed-in players only. */
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
	const complete = state.done >= state.target;
	const days = daysLeftInMonth(state);

	const claim = async () => {
		if (claiming) return;
		setClaiming(true);
		setNote(null);
		const result = await claimMonthlyQuest();
		setClaiming(false);
		if (result.status === "ok" || result.status === "already") {
			if (result.state) set(result.state);
			if (result.status === "ok") {
				if (result.wallet !== null) {
					const latest = await loadShopState();
					await commitShopState({ ...latest, balance: result.wallet }, []);
				}
				setNote({ text: t("monthly.claimed", { coins: result.coins }), ok: true });
				celebrate({ id: `monthly:${state.month}`, icon: "medalGold", accent: "#F472B6", title: t("celebrate.monthlyTitle"), subtitle: formatSeasonKey(state.month, t, true), coins: result.coins, lines: result.keys > 0 ? [t("pass.reward.keys", { count: result.keys })] : [] });
				void playSfx("achievement");
				buzz("success");
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
				<View style={[styles.medal, { opacity: state.claimed ? 1 : 0.55 }]}>
					<UiIcon name="medalGold" size={36} dimmed={!state.claimed} />
				</View>
			</View>
			<View style={[styles.inner, { backgroundColor: currentTheme.menuBackground }]}>
				<Text style={[styles.goal, { color: currentTheme.textPrimary }]}>{t("monthly.goal", { n: state.target })}</Text>
				<FillBar fraction={state.done / state.target} label={`${Math.min(state.done, state.target)} / ${state.target}`} />
				{complete && !state.claimed ? (
					<StylizedButton
						text={t("monthly.claim", { coins: state.reward })}
						onClick={() => void claim()}
						backgroundColor="#16A34A"
						disabled={claiming}
						style={styles.claimButton}
						textStyle={styles.claimText}
					/>
				) : state.claimed ? (
					<Text style={[styles.done, { color: "#4ADE80" }]}>{t("monthly.collected")}</Text>
				) : (
					<Text style={[styles.hint, { color: currentTheme.textSecondary }]}>{t("monthly.hint", { coins: state.reward })}</Text>
				)}
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
	barText: {
		textAlign: "center",
		fontFamily: "SilkscreenBold",
		fontSize: 11,
		color: "#FFFFFF",
	},
	claimButton: {
		minWidth: 0,
		margin: 0,
		alignSelf: "stretch",
	},
	claimText: {
		fontSize: 13,
	},
	done: {
		fontFamily: "SilkscreenBold",
		fontSize: 12,
		textAlign: "center",
	},
	hint: {
		fontFamily: "Silkscreen",
		fontSize: 10,
		textAlign: "center",
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
