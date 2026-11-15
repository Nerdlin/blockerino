import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import StylizedButton from "./StylizedButton";
import ChestRoulette from "./ChestRoulette";
import { ChestOdds, ChestPrizeCard, LuckyHourNote, useLuckyHour } from "./ChestParts";
import { PixelChest } from "./DailyCalendar";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { loadShopState, useShopState } from "@/constants/Shop";
import { useSoundSettings } from "@/constants/Sound";
import { gameAlert } from "@/constants/GameDialog";
import { track } from "@/constants/Analytics";
import { CHEST_PRICES, buyChest } from "@/constants/Chests";
import type { ChestPrize, ChestSize } from "@/constants/DailyReward";

const SIZES: ChestSize[] = ["small", "big"];

/** The Chests tab of the shop: buy a chest for coins and open it with the roulette. */
export default function ChestShop() {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const { state, commit } = useShopState();
	const { playSfx } = useSoundSettings();
	const lucky = useLuckyHour();
	const [busy, setBusy] = useState<ChestSize | null>(null);
	const [opening, setOpening] = useState<{ size: ChestSize; prize: ChestPrize; key: number } | null>(null);
	const [revealed, setRevealed] = useState(false);

	const open = async (size: ChestSize) => {
		if (busy) return;
		if (state.balance < CHEST_PRICES[size]) {
			playSfx("invalidPlacement");
			gameAlert(t(`chest.${size}`), t("chest.noCoins"));
			return;
		}
		playSfx("menuClick");
		setBusy(size);
		const result = await buyChest(size);
		setBusy(null);
		if (result.status !== "ok") {
			playSfx("invalidPlacement");
			gameAlert(t(`chest.${size}`), t(result.status === "no_coins" ? "chest.noCoins" : result.status === "no_account" ? "chest.needAccount" : "chest.failed"));
			return;
		}
		// the wallet takes the server's balance and items; the prize itself shows once the roulette stops
		const latest = await loadShopState();
		await commit({
			...latest,
			balance: result.coins,
			ownedItemIds: Array.from(new Set([...latest.ownedItemIds, ...result.ownedItemIds])),
		}, []);
		track("chest_buy", { size, rarity: result.chest.rarity, kind: result.chest.kind });
		setRevealed(false);
		setOpening({ size, prize: result.chest, key: Date.now() });
	};

	if (opening) {
		return (
			<View style={styles.opening}>
				<Text style={[styles.openingTitle, { color: currentTheme.textPrimary }]}>{revealed ? t("chest.youGot") : t("chest.spinning")}</Text>
				<ChestRoulette key={opening.key} prize={opening.prize} onDone={() => setRevealed(true)} />
				{revealed && (
					<>
						<ChestPrizeCard prize={opening.prize} />
						<Animated.View entering={FadeInDown.delay(250).duration(350)} style={styles.openingButtons}>
							<StylizedButton text={t("chest.close")} onClick={() => setOpening(null)} backgroundColor="rgba(255,255,255,0.1)" borderColor="rgba(255,255,255,0.16)" style={styles.openingButton} textStyle={styles.buttonText} />
							<StylizedButton text={t("chest.again")} onClick={() => void open(opening.size)} backgroundColor={currentTheme.buttonPrimary} style={styles.openingButton} textStyle={styles.buttonText} disabled={busy !== null} />
						</Animated.View>
					</>
				)}
			</View>
		);
	}

	return (
		<View style={styles.list}>
			<LuckyHourNote />
			{SIZES.map((size, index) => (
				<Animated.View key={size} entering={FadeInDown.delay(80 + index * 90).duration(350)} style={[styles.card, size === "big" && styles.cardBig]}>
					<View style={styles.cardHead}>
						<PixelChest size={size === "big" ? 64 : 54} kind={size} />
						<View style={styles.cardText}>
							<Text style={[styles.cardTitle, { color: currentTheme.textPrimary }]}>{t(`chest.${size}`)}</Text>
							<Text style={[styles.cardNote, { color: currentTheme.textSecondary }]}>{t(`chest.${size}Note`)}</Text>
						</View>
					</View>
					<ChestOdds size={size} lucky={lucky} />
					<StylizedButton
						text={busy === size ? t("chest.spinning") : t("chest.open", { price: CHEST_PRICES[size] })}
						onClick={() => void open(size)}
						backgroundColor={size === "big" ? "#B8860B" : currentTheme.buttonPrimary}
						style={styles.buyButton}
						textStyle={styles.buttonText}
						disabled={busy !== null || state.balance < CHEST_PRICES[size]}
					/>
				</Animated.View>
			))}
			<Animated.Text entering={FadeIn.delay(300)} style={[styles.footnote, { color: currentTheme.textSecondary }]}>{t("chest.noDuplicates")}</Animated.Text>
		</View>
	);
}

const styles = StyleSheet.create({
	list: {
		alignSelf: "stretch",
		gap: 12,
		marginTop: 10,
	},
	card: {
		gap: 12,
		padding: 14,
		borderRadius: 16,
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.12)",
		backgroundColor: "rgba(255,255,255,0.04)",
	},
	cardBig: {
		borderColor: "rgba(255,201,60,0.45)",
		backgroundColor: "rgba(255,201,60,0.06)",
	},
	cardHead: {
		flexDirection: "row",
		alignItems: "center",
		gap: 14,
	},
	cardText: {
		flex: 1,
		gap: 4,
	},
	cardTitle: {
		fontFamily: "Silkscreen",
		fontSize: 17,
	},
	cardNote: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		lineHeight: 16,
	},
	buyButton: {
		alignSelf: "stretch",
		minWidth: 0,
		height: 48,
		margin: 0,
		borderRadius: 12,
	},
	buttonText: {
		fontSize: 15,
	},
	footnote: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		textAlign: "center",
	},
	opening: {
		alignSelf: "stretch",
		alignItems: "center",
		gap: 14,
		marginTop: 14,
	},
	openingTitle: {
		fontFamily: "Silkscreen",
		fontSize: 18,
	},
	openingButtons: {
		alignSelf: "stretch",
		flexDirection: "row",
		gap: 10,
	},
	openingButton: {
		flex: 1,
		minWidth: 0,
		height: 48,
		margin: 0,
		borderRadius: 12,
	},
});
