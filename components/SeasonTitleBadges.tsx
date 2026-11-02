import { StyleSheet, Text, View } from "react-native";
import UiIcon from "./UiIcon";
import { useLanguage } from "@/constants/Localization";
import { useTheme } from "@/constants/Theme";
import { getLeaderboardTier } from "@/constants/LeaderboardTiers";
import type { SeasonTitle } from "@/constants/SeasonResults";

/** "2026-10" -> its month and year ("Oct 2026"); anything else is shown as it is. */
export function formatSeasonKey(seasonKey: string, t: (key: string) => string): string {
	const match = /^(\d{4})-(\d{2})$/.exec(seasonKey);
	if (!match) return seasonKey;
	const month = Number(match[2]);
	return month >= 1 && month <= 12 ? `${t(`season.month.${month}`)} ${match[1]}` : seasonKey;
}

// Permanent record of past season finishes, a medal tile for each. Unlike the live top-5 perk, these stay on the
// profile for good.
export default function SeasonTitleBadges({ titles }: { titles: SeasonTitle[] }) {
	const { t } = useLanguage();
	const { currentTheme } = useTheme();
	if (titles.length === 0) return null;

	return (
		<View style={styles.container}>
			<Text style={[styles.header, { color: currentTheme.textSecondary }]}>{t("season.titlesHeader")}</Text>
			<View style={styles.tiles}>
				{titles.map((title) => {
					const tier = getLeaderboardTier(title.rank);
					const color = tier?.color ?? currentTheme.textPrimary;
					const place = title.rank === 1 ? t("perk.champion") : t("perk.top", { rank: title.rank });
					return (
						<View
							key={`${title.seasonKey}-${title.board}`}
							testID={`season-title-${title.seasonKey}-${title.board}`}
							style={[styles.tile, { borderColor: color, backgroundColor: tier?.background ?? "rgba(255,255,255,0.06)" }]}
						>
							<View style={[styles.medal, { borderColor: color }]}>
								<UiIcon name={tier?.icon ?? "star"} size={20} />
							</View>
							<Text style={[styles.place, { color }]} numberOfLines={1}>{place}</Text>
							<Text style={[styles.board, { color: currentTheme.textPrimary }]} numberOfLines={1}>{t(`perk.board.${title.board}`)}</Text>
							<Text style={[styles.season, { color: currentTheme.textSecondary }]} numberOfLines={1}>{formatSeasonKey(title.seasonKey, t)}</Text>
						</View>
					);
				})}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		alignItems: "center",
		gap: 6,
		marginTop: 8,
		marginBottom: 4,
		width: "100%",
	},
	header: {
		fontFamily: "Silkscreen",
		fontSize: 11,
	},
	tiles: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "center",
		gap: 8,
	},
	tile: {
		width: 96,
		alignItems: "center",
		gap: 2,
		paddingVertical: 8,
		paddingHorizontal: 4,
		borderRadius: 10,
		borderWidth: 1.5,
	},
	medal: {
		width: 34,
		height: 34,
		borderRadius: 17,
		borderWidth: 1.5,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(0,0,0,0.35)",
		marginBottom: 2,
	},
	place: {
		fontFamily: "Silkscreen",
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
