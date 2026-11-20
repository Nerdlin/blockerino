import { StyleSheet, Text, View } from "react-native";
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

// Permanent record of past season finishes: one compact row per title (medal, place and board, season on the right).
// Unlike the live top-5 perk, these stay on the profile for good. A long list shows the latest few and a count.
const SHOWN = 3;

export default function SeasonTitleBadges({ titles }: { titles: SeasonTitle[] }) {
	const { t } = useLanguage();
	const { currentTheme } = useTheme();
	if (titles.length === 0) return null;
	const shown = titles.slice(0, SHOWN);

	return (
		<View style={styles.container}>
			<Text style={[styles.header, { color: currentTheme.textSecondary }]}>{t("season.titlesHeader")}</Text>
			{shown.map((title) => {
				const tier = getLeaderboardTier(title.rank);
				const color = tier?.color ?? currentTheme.textPrimary;
				const place = title.rank === 1 ? t("perk.champion") : t("perk.top", { rank: title.rank });
				return (
					<View
						key={`${title.seasonKey}-${title.board}`}
						testID={`season-title-${title.seasonKey}-${title.board}`}
						style={[styles.row, { borderColor: color, backgroundColor: tier?.background ?? "rgba(255,255,255,0.06)" }]}
					>
						<View style={[styles.medal, { borderColor: color }]}>
							<UiIcon name={tier?.icon ?? "star"} size={18} />
						</View>
						<Text style={styles.text} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
							<Text style={[styles.place, { color }]}>{place}</Text>
							<Text style={[styles.board, { color: currentTheme.textPrimary }]}>{` · ${t(`perk.board.${title.board}`)}`}</Text>
						</Text>
						<Text style={[styles.season, { color: currentTheme.textSecondary }]} numberOfLines={1}>{formatSeasonKey(title.seasonKey, t)}</Text>
					</View>
				);
			})}
			{titles.length > SHOWN ? <Text style={[styles.more, { color: currentTheme.textSecondary }]}>+{titles.length - SHOWN}</Text> : null}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		gap: 6,
		marginTop: 6,
		marginBottom: 6,
		width: "100%",
	},
	header: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		paddingHorizontal: 4,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingVertical: 6,
		paddingHorizontal: 8,
		borderRadius: 10,
		borderWidth: 1.5,
	},
	medal: {
		width: 30,
		height: 30,
		borderRadius: 15,
		borderWidth: 1.5,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(0,0,0,0.35)",
	},
	text: {
		flex: 1,
	},
	place: {
		fontFamily: "SilkscreenBold",
		fontSize: 12,
	},
	board: {
		fontFamily: "Silkscreen",
		fontSize: 11,
	},
	season: {
		fontFamily: "Silkscreen",
		fontSize: 11,
	},
	more: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		textAlign: "center",
	},
});
