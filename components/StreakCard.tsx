import { StyleSheet, Text, View } from "react-native";
import { useAtomValue } from "jotai";
import StreakFlame from "./StreakFlame";
import UiIcon from "./UiIcon";
import FadeInView from "./FadeInView";
import { CountUp } from "./ProfileDesign";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { dailyRewardStatusAtom } from "@/constants/DailyReward";

/** The streak as on Duolingo: a breathing flame, the days in big red numbers and the freezes below. Own profile only. */
export default function StreakCard() {
	const { t } = useLanguage();
	const { currentTheme } = useTheme();
	const status = useAtomValue(dailyRewardStatusAtom);
	if (!status) return null;
	const alive = status.streak > 0;
	return (
		<FadeInView style={[styles.card, { borderColor: alive ? "#FB7185" : currentTheme.gridBorder }]}>
			<StreakFlame size={54} dimmed={!alive} />
			<View style={styles.text}>
				<CountUp value={status.streak} style={[styles.number, { color: alive ? "#FB4B5B" : currentTheme.textSecondary }]} />
				<Text style={[styles.label, { color: alive ? "#FB4B5B" : currentTheme.textSecondary }]}>{t("streak.days")}</Text>
				<View style={styles.freezeRow}>
					<UiIcon name="diamond" size={18} dimmed={status.freezes === 0} />
					<Text style={[styles.freeze, { color: status.freezes > 0 ? "#6BC7FF" : currentTheme.textSecondary }]}>{t("streak.freezes", { have: status.freezes, cap: status.freezeCap })}</Text>
				</View>
			</View>
			<View style={styles.best}>
				<Text style={[styles.bestValue, { color: currentTheme.textPrimary }]}>{status.best}</Text>
				<Text style={[styles.bestLabel, { color: currentTheme.textSecondary }]}>{t("streak.best")}</Text>
			</View>
		</FadeInView>
	);
}

const styles = StyleSheet.create({
	card: {
		width: "100%",
		flexDirection: "row",
		alignItems: "center",
		gap: 14,
		paddingVertical: 10,
		paddingHorizontal: 14,
		borderWidth: 2,
		borderBottomWidth: 5,
		borderRadius: 14,
		marginTop: 6,
		marginBottom: 4,
		backgroundColor: "rgba(251,113,133,0.06)",
	},
	text: {
		flex: 1,
		gap: 0,
	},
	number: {
		fontFamily: "SilkscreenBold",
		fontSize: 34,
	},
	label: {
		fontFamily: "SilkscreenBold",
		fontSize: 12,
	},
	freezeRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		marginTop: 4,
	},
	freeze: {
		fontFamily: "Silkscreen",
		fontSize: 10,
	},
	best: {
		alignItems: "center",
	},
	bestValue: {
		fontFamily: "SilkscreenBold",
		fontSize: 18,
	},
	bestLabel: {
		fontFamily: "Silkscreen",
		fontSize: 9,
	},
});
