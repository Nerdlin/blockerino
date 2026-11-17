import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOut, LinearTransition } from "react-native-reanimated";
import StylizedButton from "./StylizedButton";
import ChestRoulette from "./ChestRoulette";
import { ChestPrizeCard } from "./ChestParts";
import { PixelChest } from "./DailyCalendar";
import { useLanguage } from "@/constants/Localization";
import { loadShopState, useShopState } from "@/constants/Shop";
import { useSoundSettings } from "@/constants/Sound";
import { gameAlert } from "@/constants/GameDialog";
import { track } from "@/constants/Analytics";
import { fetchGiftChests, openGiftChest, type GiftChest } from "@/constants/Gifts";
import { useProfileBadge } from "@/constants/ProfileBadge";
import type { ChestPrize } from "@/constants/DailyReward";

/**
 * The chests friends gave, kept in the profile until the player opens them. Opening one spins the same roulette as
 * the shop. With none it says so, so the player knows where gifts arrive.
 */
export default function GiftChestsPanel() {
	const { t } = useLanguage();
	const { commit } = useShopState();
	const { playSfx } = useSoundSettings();
	const { refresh: refreshBadge } = useProfileBadge();
	const [chests, setChests] = useState<GiftChest[] | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const [opening, setOpening] = useState<{ prize: ChestPrize; key: number; exclusive: boolean; pity: boolean; from: string } | null>(null);
	const [revealed, setRevealed] = useState(false);

	const load = useCallback(async () => setChests(await fetchGiftChests()), []);
	useEffect(() => {
		void load();
	}, [load]);

	const open = async (gift: GiftChest) => {
		if (busy) return;
		playSfx("menuClick");
		setBusy(gift.id);
		const result = await openGiftChest(gift.id);
		setBusy(null);
		if (result.status !== "ok") {
			playSfx("invalidPlacement");
			gameAlert(t("gift.chestsTitle"), t(result.status === "no_account" ? "chest.needAccount" : "chest.failed"));
			void load();
			return;
		}
		const latest = await loadShopState();
		await commit({ ...latest, balance: result.coins, ownedItemIds: Array.from(new Set([...latest.ownedItemIds, ...result.ownedItemIds])) }, []);
		track("gift_chest_open", { rarity: result.chest.rarity });
		setChests((list) => (list ?? []).filter((entry) => entry.id !== gift.id));
		setRevealed(false);
		setOpening({ prize: result.chest, key: Date.now(), exclusive: result.exclusive, pity: result.pity, from: gift.fromName });
		void refreshBadge();
	};

	if (opening) {
		return (
			<View style={styles.box}>
				<Text style={styles.title}>{revealed ? t("gift.chestFrom", { name: opening.from }) : t("chest.spinning")}</Text>
				<ChestRoulette key={opening.key} prize={opening.prize} onDone={() => setRevealed(true)} />
				{revealed && (
					<>
						<ChestPrizeCard prize={opening.prize} exclusive={opening.exclusive} pity={opening.pity} />
						<StylizedButton text={t("chest.close")} onClick={() => setOpening(null)} backgroundColor="#7C3AED" style={styles.button} textStyle={styles.buttonText} />
					</>
				)}
			</View>
		);
	}

	// still loading: nothing yet, so the panel does not flash empty first
	if (chests === null) return null;

	if (chests.length === 0) {
		return (
			<Animated.View entering={FadeInDown.duration(320)} style={styles.box}>
				<Text style={styles.title}>{t("gift.chestsTitle")}</Text>
				<View style={styles.emptyRow}>
					<PixelChest size={28} kind="small" />
					<Text style={styles.empty}>{t("gift.chestsEmpty")}</Text>
				</View>
			</Animated.View>
		);
	}

	return (
		<Animated.View entering={FadeInDown.duration(320)} layout={LinearTransition.duration(220)} style={styles.box}>
			<Text style={styles.title}>{t("gift.chestsTitle")}</Text>
			{chests.map((gift, index) => (
				<Animated.View key={gift.id} entering={FadeInDown.delay(index * 60).duration(300)} exiting={FadeOut.duration(200)} style={styles.row}>
					<PixelChest size={34} kind="small" />
					<Text style={styles.from} numberOfLines={1}>{t("gift.chestFrom", { name: gift.fromName })}</Text>
					<StylizedButton
						text={busy === gift.id ? "..." : t("gift.openChest")}
						onClick={() => void open(gift)}
						backgroundColor="#B8860B"
						style={styles.openButton}
						textStyle={styles.buttonText}
						disabled={busy !== null}
					/>
				</Animated.View>
			))}
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	box: {
		alignSelf: "stretch",
		gap: 8,
		padding: 12,
		marginBottom: 12,
		borderRadius: 14,
		borderWidth: 1,
		borderColor: "rgba(167,139,250,0.55)",
		backgroundColor: "rgba(124,58,237,0.1)",
	},
	title: {
		fontFamily: "Silkscreen",
		fontSize: 14,
		color: "#DDD6FE",
		textAlign: "center",
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	emptyRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		opacity: 0.75,
	},
	empty: {
		flex: 1,
		fontFamily: "Silkscreen",
		fontSize: 11,
		lineHeight: 16,
		color: "#A1A1AA",
	},
	from: {
		flex: 1,
		fontFamily: "Silkscreen",
		fontSize: 12,
		color: "#E4E4E7",
	},
	openButton: {
		minWidth: 0,
		height: 34,
		paddingHorizontal: 14,
		margin: 0,
		borderRadius: 9,
	},
	button: {
		alignSelf: "stretch",
		minWidth: 0,
		height: 42,
		margin: 0,
		borderRadius: 10,
	},
	buttonText: {
		fontSize: 13,
	},
});
