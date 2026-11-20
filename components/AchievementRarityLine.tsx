import { StyleSheet, Text, View } from "react-native";
import { useLanguage } from "@/constants/Localization";
import { useTheme } from "@/constants/Theme";
import {
	RARITY_CLASS_COLORS,
	formatRarityPercent,
	rarityClass,
	rarityPercent,
	useAchievementRarity,
} from "@/constants/AchievementRarity";

/** "Есть у 2,6% игроков" with a coloured rarity tag, like the Steam achievement list; nothing while the base is small. */
export default function AchievementRarityLine({ achievementId, compact = false }: { achievementId: string; compact?: boolean }) {
	const { t } = useLanguage();
	const { currentTheme } = useTheme();
	const rarity = useAchievementRarity();
	const percent = rarityPercent(rarity, achievementId);
	if (percent === null) return null;
	const kind = rarityClass(percent);
	const color = RARITY_CLASS_COLORS[kind];
	return (
		<View style={styles.row}>
			<View style={[styles.tag, { borderColor: color }]}>
				<Text style={[styles.tagText, { color }]}>{t(`ach.rarity.${kind}`)}</Text>
			</View>
			{compact ? null : (
				<Text style={[styles.text, { color: currentTheme.textSecondary }]} numberOfLines={1}>
					{t("ach.havePct", { pct: formatRarityPercent(percent) })}
				</Text>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		marginTop: 2,
	},
	tag: {
		paddingHorizontal: 5,
		paddingVertical: 1,
		borderRadius: 4,
		borderWidth: 1,
	},
	tagText: {
		fontFamily: "SilkscreenBold",
		fontSize: 9,
	},
	text: {
		flexShrink: 1,
		fontFamily: "Silkscreen",
		fontSize: 10,
	},
});
