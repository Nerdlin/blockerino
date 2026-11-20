import { ScrollView, StyleSheet, Text, View } from "react-native";
import FadeInView from "./FadeInView";
import { SectionLabel, withAlpha } from "./ProfileDesign";
import UiIcon from "./UiIcon";
import { useLanguage } from "@/constants/Localization";
import { useTheme } from "@/constants/Theme";
import { getLeaderboardTier } from "@/constants/LeaderboardTiers";
import type { SeasonTitle } from "@/constants/SeasonResults";

/** "2026-10" -> its month and year ("Oct 2026"); anything else is shown as it is. */
export function formatSeasonKey(seasonKey: string, t: (key: string) => string, full = false): string {
	const match = /^(\d{4})-(\d{2})$/.exec(seasonKey);
	if (!match) return seasonKey;
	const month = Number(match[2]);
	return month >= 1 && month <= 12 ? `${t(`${full ? "season.monthFull" : "season.month"}.${month}`)} ${match[1]}` : seasonKey;
}

// Permanent record of past season finishes, shown as a row of medals (a frame in the tier colour, the place, the board
// and the month under it). Unlike the live top-5 perk, these stay on the profile for good.
export default function SeasonTitleBadges({ titles }: { titles: SeasonTitle[] }) {
	const { t } = useLanguage();
	const { currentTheme } = useTheme();
	if (titles.length === 0) return null;

	return (
		<View style={styles.container}>
			<SectionLabel>{t("season.titlesHeader")}</SectionLabel>
			<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
				{titles.map((title, index) => {
					const tier = getLeaderboardTier(title.rank);
					const color = tier?.color ?? currentTheme.textPrimary;
					const place = title.rank === 1 ? t("perk.champion") : t("perk.top", { rank: title.rank });
					return (
						<FadeInView
							key={`${title.seasonKey}-${title.board}`}
							index={index}
							pop
							style={styles.medal}
						>
							<View
								testID={`season-title-${title.seasonKey}-${title.board}`}
								style={[styles.frame, { borderColor: color, backgroundColor: withAlpha(color, 0.14) }]}
							>
								<UiIcon name={tier?.icon ?? "star"} size={30} />
							</View>
							<Text style={[styles.place, { color }]} numberOfLines={1}>{place}</Text>
							<Text style={[styles.board, { color: currentTheme.textPrimary }]} numberOfLines={1}>{t(`perk.board.${title.board}`)}</Text>
							<Text style={[styles.season, { color: currentTheme.textSecondary }]} numberOfLines={1}>{formatSeasonKey(title.seasonKey, t)}</Text>
						</FadeInView>
					);
				})}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		gap: 10,
		marginTop: 8,
		marginBottom: 6,
		width: "100%",
	},
	row: {
		gap: 12,
		paddingVertical: 2,
	},
	medal: {
		width: 92,
		alignItems: "center",
		gap: 2,
	},
	frame: {
		width: 62,
		height: 62,
		borderRadius: 18,
		borderWidth: 2,
		borderBottomWidth: 5,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 4,
	},
	place: {
		fontFamily: "SilkscreenBold",
		fontSize: 11,
	},
	board: {
		fontFamily: "Silkscreen",
		fontSize: 10,
	},
	season: {
		fontFamily: "Silkscreen",
		fontSize: 9,
	},
});
