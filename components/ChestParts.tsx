import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";
import CosmeticPreview from "./CosmeticPreview";
import UiIcon from "./UiIcon";
import { useLanguage } from "@/constants/Localization";
import { getShopItem } from "@/constants/Shop";
import { shopItemText } from "@/constants/i18n/shopItems";
import { RARITY_COLORS, type ChestPrize, type ChestSize } from "@/constants/DailyReward";
import { chestOdds, isLuckyHour, luckyHourTimes, type ChestOdd } from "@/constants/Chests";

const ODD_COLORS: Record<ChestOdd["kind"], string> = {
	// green: gold is the colour of legendary
	coins: "#4ADE80",
	common_rare: RARITY_COLORS.rare,
	common: RARITY_COLORS.common,
	rare: RARITY_COLORS.rare,
	epic: RARITY_COLORS.epic,
	legendary: RARITY_COLORS.legendary,
};

/** True while the lucky hour runs; checks again every 30 s. */
export function useLuckyHour(): boolean {
	const [lucky, setLucky] = useState(isLuckyHour);
	useEffect(() => {
		const timer = setInterval(() => setLucky(isLuckyHour()), 30_000);
		return () => clearInterval(timer);
	}, []);
	return lucky;
}

/** The chances of a chest as a coloured bar and a legend. */
export function ChestOdds({ size, lucky }: { size: ChestSize; lucky: boolean }) {
	const { t } = useLanguage();
	const odds = chestOdds(size, lucky);
	return (
		<View style={styles.odds}>
			<View style={styles.oddsBar}>
				{odds.map((odd) => (
					<View key={odd.kind} style={{ flex: odd.percent, backgroundColor: ODD_COLORS[odd.kind] }} />
				))}
			</View>
			{odds.map((odd) => (
				<View key={odd.kind} style={styles.oddRow}>
					<View style={[styles.oddDot, { backgroundColor: ODD_COLORS[odd.kind] }]} />
					<Text style={styles.oddName}>{t(`chest.kind.${odd.kind}`)}</Text>
					<Text style={[styles.oddPercent, { color: ODD_COLORS[odd.kind] }]}>{odd.percent}%</Text>
				</View>
			))}
		</View>
	);
}

/** h:mm until the lucky hour. */
function formatWait(ms: number): string {
	const minutes = Math.max(1, Math.round(ms / 60_000));
	return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

/** "Lucky hour now" or when the next one starts. */
export function LuckyHourNote() {
	const { t } = useLanguage();
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), 30_000);
		return () => clearInterval(timer);
	}, []);
	const { startsIn, endsIn } = luckyHourTimes(now);
	const lucky = startsIn === 0;
	return (
		<View style={[styles.lucky, lucky && styles.luckyOn]}>
			<UiIcon name={lucky ? "starGold" : "star"} size={16} />
			<Text style={[styles.luckyText, lucky && { color: "#FFD700" }]}>
				{lucky ? t("chest.luckyNow", { minutes: Math.max(1, Math.ceil(endsIn / 60_000)) }) : t("chest.luckySoon", { time: formatWait(startsIn) })}
			</Text>
		</View>
	);
}

/** The prize after the roulette stopped. */
export function ChestPrizeCard({ prize }: { prize: ChestPrize }) {
	const { t, language } = useLanguage();
	const item = prize.kind === "item" ? getShopItem(prize.itemId) : undefined;
	const color = RARITY_COLORS[prize.rarity];
	return (
		<Animated.View entering={ZoomIn.springify().damping(18).stiffness(180)} style={[styles.prize, { borderColor: color, backgroundColor: `${color}14` }]}>
			<Text style={[styles.prizeRarity, { color }]}>{t(`daily.rarity.${prize.rarity}`)}</Text>
			{item ? (
				<>
					<View style={styles.prizePreview}><CosmeticPreview item={item} large /></View>
					<Text style={styles.prizeName}>{shopItemText(item, language).title}</Text>
					{prize.coins > 0 && <Text style={styles.prizeCoins}>{t("chest.plusCoins", { coins: prize.coins })}</Text>}
				</>
			) : (
				<Animated.View entering={FadeIn.delay(150)} style={styles.prizeCoinsRow}>
					<UiIcon name="coin" size={34} />
					<Text style={[styles.prizeName, { color: "#FFD700" }]}>{t("chest.coinsPrize", { coins: prize.coins })}</Text>
				</Animated.View>
			)}
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	odds: {
		alignSelf: "stretch",
		gap: 5,
	},
	oddsBar: {
		flexDirection: "row",
		height: 8,
		borderRadius: 4,
		overflow: "hidden",
		marginBottom: 2,
		gap: 2,
	},
	oddRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	oddDot: {
		width: 8,
		height: 8,
		borderRadius: 2,
	},
	oddName: {
		flex: 1,
		fontFamily: "Silkscreen",
		fontSize: 12,
		color: "#D4D4D8",
	},
	oddPercent: {
		fontFamily: "Silkscreen",
		fontSize: 12,
	},
	lucky: {
		alignSelf: "stretch",
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.12)",
		backgroundColor: "rgba(255,255,255,0.04)",
	},
	luckyOn: {
		borderColor: "rgba(255,215,0,0.6)",
		backgroundColor: "rgba(255,215,0,0.1)",
	},
	luckyText: {
		flex: 1,
		fontFamily: "Silkscreen",
		fontSize: 11,
		lineHeight: 16,
		color: "#A1A1AA",
	},
	prize: {
		alignSelf: "stretch",
		alignItems: "center",
		gap: 8,
		paddingVertical: 14,
		paddingHorizontal: 12,
		borderRadius: 14,
		borderWidth: 2,
	},
	prizeRarity: {
		fontFamily: "Silkscreen",
		fontSize: 16,
	},
	prizePreview: {
		width: 200,
		alignItems: "center",
	},
	prizeName: {
		fontFamily: "Silkscreen",
		fontSize: 16,
		color: "#FFFFFF",
		textAlign: "center",
	},
	prizeCoins: {
		fontFamily: "Silkscreen",
		fontSize: 13,
		color: "#FFD700",
	},
	prizeCoinsRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
});
