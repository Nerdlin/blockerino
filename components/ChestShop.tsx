import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import StylizedButton from "./StylizedButton";
import ChestRoulette from "./ChestRoulette";
import { ChestOdds, ChestPrizeCard, LuckyHourNote, useLuckyHour } from "./ChestParts";
import { PixelChest } from "./DailyCalendar";
import UiIcon from "./UiIcon";
import GiftFriendPicker from "./GiftFriendPicker";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { loadShopState, useShopState } from "@/constants/Shop";
import { useSoundSettings } from "@/constants/Sound";
import { gameAlert } from "@/constants/GameDialog";
import { track } from "@/constants/Analytics";
import { CHEST_PRICES, KEY_SHARDS, PITY_MAX, buyChest, openKeyChest, useChestState, type BuyChestResult } from "@/constants/Chests";
import type { ChestPrize, ChestSize } from "@/constants/DailyReward";

const SIZES: ChestSize[] = ["small", "big"];

type OpenWith = ChestSize | "key";

/** The Chests tab of the shop: buy a chest for coins and open it with the roulette. */
export default function ChestShop() {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const { state, commit } = useShopState();
	const { playSfx } = useSoundSettings();
	const lucky = useLuckyHour();
	const { chestState } = useChestState();
	const [busy, setBusy] = useState<OpenWith | null>(null);
	const [opening, setOpening] = useState<{ via: OpenWith; prize: ChestPrize; key: number; pity: boolean; exclusive: boolean } | null>(null);
	const [revealed, setRevealed] = useState(false);
	const [giftOpen, setGiftOpen] = useState(false);
	const keys = chestState?.keys ?? 0;

	const open = async (via: OpenWith) => {
		if (busy) return;
		const title = via === "key" ? t("chest.keyChest") : t(`chest.${via}`);
		if (via !== "key" && state.balance < CHEST_PRICES[via]) {
			playSfx("invalidPlacement");
			gameAlert(title, t("chest.noCoins"));
			return;
		}
		playSfx("menuClick");
		setBusy(via);
		const result: BuyChestResult = via === "key" ? await openKeyChest() : await buyChest(via);
		setBusy(null);
		if (result.status !== "ok") {
			playSfx("invalidPlacement");
			const reason = result.status === "no_coins" ? "chest.noCoins" : result.status === "no_keys" ? "chest.noKeys" : result.status === "no_account" ? "chest.needAccount" : "chest.failed";
			gameAlert(title, t(reason));
			return;
		}
		// the wallet takes the server's balance and items; the prize itself shows once the roulette stops
		const latest = await loadShopState();
		await commit({
			...latest,
			balance: result.coins,
			ownedItemIds: Array.from(new Set([...latest.ownedItemIds, ...result.ownedItemIds])),
		}, []);
		track(via === "key" ? "chest_key" : "chest_buy", { size: result.chest.size, rarity: result.chest.rarity, kind: result.chest.kind, exclusive: result.exclusive });
		setRevealed(false);
		setOpening({ via, prize: result.chest, key: Date.now(), pity: result.pity, exclusive: result.exclusive });
	};

	const canRepeat = opening ? (opening.via === "key" ? keys > 0 : state.balance >= CHEST_PRICES[opening.via]) : false;

	if (opening) {
		return (
			<View style={styles.opening}>
				<Text style={[styles.openingTitle, { color: currentTheme.textPrimary }]}>{revealed ? t("chest.youGot") : t("chest.spinning")}</Text>
				<ChestRoulette key={opening.key} prize={opening.prize} onDone={() => setRevealed(true)} />
				{revealed && (
					<>
						<ChestPrizeCard prize={opening.prize} exclusive={opening.exclusive} pity={opening.pity} />
						<Animated.View entering={FadeInDown.delay(250).duration(350)} style={styles.openingButtons}>
							<StylizedButton text={t("chest.close")} onClick={() => setOpening(null)} backgroundColor="rgba(255,255,255,0.1)" borderColor="rgba(255,255,255,0.16)" style={styles.openingButton} textStyle={styles.buttonText} />
							<StylizedButton text={t("chest.again")} onClick={() => void open(opening.via)} backgroundColor={currentTheme.buttonPrimary} style={styles.openingButton} textStyle={styles.buttonText} disabled={busy !== null || !canRepeat} />
						</Animated.View>
					</>
				)}
			</View>
		);
	}

	return (
		<View style={styles.list}>
			<LuckyHourNote />
			<Animated.View entering={FadeInDown.duration(350)} style={[styles.keysCard, keys > 0 && styles.keysCardReady]}>
				<View style={styles.keysHead}>
					<UiIcon name="key" size={30} />
					<View style={styles.cardText}>
						<Text style={[styles.cardTitle, { color: currentTheme.textPrimary }]}>{t("chest.keys", { count: keys })}</Text>
						<Text style={[styles.cardNote, { color: currentTheme.textSecondary }]}>{t("chest.keysNote")}</Text>
					</View>
				</View>
				<View style={styles.progressRow}>
					<Text style={styles.progressLabel}>{t("chest.shards", { shards: chestState?.keyShards ?? 0, total: KEY_SHARDS })}</Text>
					<View style={styles.pips}>
						{Array.from({ length: KEY_SHARDS }, (_, i) => (
							<View key={i} style={[styles.pip, i < (chestState?.keyShards ?? 0) && styles.pipOn]} />
						))}
					</View>
				</View>
				<View style={styles.progressRow}>
					<Text style={styles.progressLabel}>{t("chest.pity", { left: PITY_MAX - Math.min(PITY_MAX - 1, chestState?.pity ?? 0) })}</Text>
					<View style={styles.pityBar}>
						<View style={[styles.pityFill, { width: `${((chestState?.pity ?? 0) / (PITY_MAX - 1)) * 100}%` }]} />
					</View>
				</View>
				{keys > 0 && (
					<StylizedButton
						text={busy === "key" ? t("chest.spinning") : t("chest.openKey")}
						onClick={() => void open("key")}
						backgroundColor="#B8860B"
						style={styles.buyButton}
						textStyle={styles.buttonText}
						disabled={busy !== null}
					/>
				)}
			</Animated.View>
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
			<Pressable onPress={() => { playSfx("menuClick"); setGiftOpen(true); }} accessibilityRole="button" style={styles.giftRow}>
				<UiIcon name="gift" size={22} />
				<Text style={styles.giftText}>{t("gift.chestButton", { price: CHEST_PRICES.small })}</Text>
			</Pressable>
			<Animated.Text entering={FadeIn.delay(300)} style={[styles.footnote, { color: currentTheme.textSecondary }]}>{t("chest.noDuplicates")}</Animated.Text>
			<GiftFriendPicker gift={giftOpen ? { kind: "chest" } : null} onClose={() => setGiftOpen(false)} />
		</View>
	);
}

const styles = StyleSheet.create({
	keysCard: {
		gap: 10,
		padding: 14,
		borderRadius: 16,
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.12)",
		backgroundColor: "rgba(255,255,255,0.04)",
	},
	keysCardReady: {
		borderColor: "rgba(255,215,0,0.6)",
		backgroundColor: "rgba(255,215,0,0.08)",
	},
	keysHead: {
		flexDirection: "row",
		alignItems: "center",
		gap: 14,
	},
	progressRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	progressLabel: {
		flex: 1,
		fontFamily: "Silkscreen",
		fontSize: 11,
		lineHeight: 15,
		color: "#D4D4D8",
	},
	pips: {
		flexDirection: "row",
		gap: 4,
	},
	pip: {
		width: 14,
		height: 14,
		borderRadius: 3,
		borderWidth: 1,
		borderColor: "rgba(255,215,0,0.5)",
		backgroundColor: "rgba(255,255,255,0.05)",
	},
	pipOn: {
		backgroundColor: "#FFC93C",
		borderColor: "#FFE680",
	},
	pityBar: {
		width: 86,
		height: 8,
		borderRadius: 4,
		overflow: "hidden",
		backgroundColor: "rgba(255,255,255,0.08)",
	},
	pityFill: {
		height: "100%",
		backgroundColor: "#FFC93C",
	},
	giftRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 10,
		paddingVertical: 12,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "rgba(167,139,250,0.5)",
		backgroundColor: "rgba(124,58,237,0.12)",
	},
	giftText: {
		fontFamily: "Silkscreen",
		fontSize: 13,
		color: "#DDD6FE",
	},
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
