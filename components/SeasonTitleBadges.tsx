import { StyleSheet, Text, View } from "react-native";
import UiIcon from "./UiIcon";
import { useLanguage } from "@/constants/Localization";
import { useTheme } from "@/constants/Theme";
import { getLeaderboardTier } from "@/constants/LeaderboardTiers";
import type { SeasonTitle } from "@/constants/SeasonResults";

// Permanent record of past season finishes ("Champion · Classic · 2026-09"). Unlike the live
// top-5 perk, these stay on the profile for good.
export default function SeasonTitleBadges({ titles }: { titles: SeasonTitle[] }) {
	const { t } = useLanguage();
	const { currentTheme } = useTheme();
	if (titles.length === 0) return null;

	return (
		<View style={styles.container}>
			<Text style={[styles.header, { color: currentTheme.textSecondary }]}>{t("season.titlesHeader")}</Text>
			{titles.map((title) => {
				const tier = getLeaderboardTier(title.rank);
				const place = title.rank === 1 ? t("perk.champion") : t("perk.top", { rank: title.rank });
				return (
					<View key={`${title.seasonKey}-${title.board}`} style={styles.row}>
						<UiIcon name={tier?.icon ?? "star"} size={16} />
						<Text style={[styles.text, { color: tier?.color ?? currentTheme.textPrimary }]}>
							{t("season.titleLine", { place, board: t(`perk.board.${title.board}`), season: title.seasonKey })}
						</Text>
					</View>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		alignItems: "center",
		gap: 4,
		marginTop: 6,
	},
	header: {
		fontFamily: "Silkscreen",
		fontSize: 11,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
	},
	text: {
		fontFamily: "Silkscreen",
		fontSize: 12,
	},
});
