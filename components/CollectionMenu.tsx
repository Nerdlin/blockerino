import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import StylizedButton from "./StylizedButton";
import UiIcon from "./UiIcon";
import { opaqueColor, useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { useShopState } from "@/constants/Shop";
import { useSoundSettings } from "@/constants/Sound";
import { useChestState } from "@/constants/Chests";
import { RARITY_COLORS } from "@/constants/DailyReward";
import { EXCLUSIVE_SET, RARITY_ORDER, buildCollectionSets, claimCollectionSet, summarizeCollection, type CollectionSet } from "@/constants/Collection";

const RARITY_RANK = { common: 0, rare: 1, epic: 2, legendary: 3 } as const;

/** Everything collected so far, by rarity and by set; complete sets pay keys once. */
export default function CollectionMenu({ onClose }: { onClose: () => void }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const { state } = useShopState();
	const { playSfx } = useSoundSettings();
	const { chestState } = useChestState();
	const [claiming, setClaiming] = useState<string | null>(null);
	// shown inside this window: a game dialog would open behind the modal
	const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);

	const summary = useMemo(() => summarizeCollection(state.ownedItemIds, chestState), [state.ownedItemIds, chestState]);
	const sets = useMemo(() => {
		const list = buildCollectionSets(state.ownedItemIds, chestState?.collectionSets ?? []);
		// ready to claim first, then the exclusives, then by how close the set is to complete
		const weight = (set: CollectionSet) => (set.complete && !set.claimed ? 0 : set.id === EXCLUSIVE_SET ? 1 : set.claimed ? 3 : 2);
		return list.sort((a, b) => weight(a) - weight(b)
			|| b.owned / b.items.length - a.owned / a.items.length
			|| (a.rarity ? RARITY_RANK[a.rarity] : 9) - (b.rarity ? RARITY_RANK[b.rarity] : 9));
	}, [state.ownedItemIds, chestState]);

	const setName = (set: CollectionSet) =>
		set.id === EXCLUSIVE_SET ? t("collection.exclusive") : `${t(`collection.category.${set.category}`)} · ${t(`chest.kind.${set.rarity}`)}`;

	const claim = async (set: CollectionSet) => {
		if (claiming) return;
		setClaiming(set.id);
		const result = await claimCollectionSet(set.id);
		setClaiming(null);
		if (result.status === "ok") {
			playSfx("menuClick");
			setNote({ text: t("collection.claimed", { name: setName(set), keys: result.keys }), ok: true });
			return;
		}
		playSfx("invalidPlacement");
		setNote({ text: t(result.status === "no_account" ? "chest.needAccount" : "collection.failed"), ok: false });
	};

	return (
		<Modal transparent animationType="fade" visible onRequestClose={onClose}>
			<Pressable style={styles.backdrop} onPress={onClose}>
				<Pressable style={[styles.card, { backgroundColor: opaqueColor(currentTheme.menuBackground) }]} onPress={() => undefined}>
					<Text style={[styles.title, { color: currentTheme.textPrimary }]}>{t("collection.title")}</Text>
					<Text style={[styles.total, { color: currentTheme.accent }]}>{t("collection.total", { owned: summary.owned, total: summary.total })}</Text>
					<View style={styles.rarities}>
						{RARITY_ORDER.map((rarity) => {
							const entry = summary.byRarity[rarity];
							return (
								<View key={rarity} style={styles.rarity}>
									<Text style={[styles.rarityName, { color: RARITY_COLORS[rarity] }]} numberOfLines={1}>{t(`chest.kind.${rarity}`)}</Text>
									<View style={styles.bar}>
										<View style={[styles.barFill, { backgroundColor: RARITY_COLORS[rarity], width: `${entry.total ? (entry.owned / entry.total) * 100 : 0}%` }]} />
									</View>
									<Text style={styles.rarityCount}>{entry.owned}/{entry.total}</Text>
								</View>
							);
						})}
					</View>
					<Text style={[styles.note, { color: note ? (note.ok ? "#4ADE80" : "#F87171") : currentTheme.textSecondary }]}>{note ? note.text : t("collection.note")}</Text>
					<ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
						{sets.map((set, index) => {
							const color = set.rarity ? RARITY_COLORS[set.rarity] : "#FFC93C";
							const ready = set.complete && !set.claimed;
							return (
								<Animated.View key={set.id} entering={FadeInDown.delay(Math.min(index, 10) * 40).duration(300)} style={[styles.set, ready && { borderColor: "#FFD700", backgroundColor: "rgba(255,215,0,0.08)" }]}>
									<View style={styles.setHead}>
										<Text style={[styles.setName, { color }]} numberOfLines={1}>{setName(set)}</Text>
										<Text style={styles.setCount}>{set.owned}/{set.items.length}</Text>
									</View>
									<View style={styles.bar}>
										<View style={[styles.barFill, { backgroundColor: color, width: `${(set.owned / set.items.length) * 100}%` }]} />
									</View>
									<View style={styles.setFoot}>
										<View style={styles.reward}>
											<UiIcon name="key" size={12} />
											<Text style={styles.rewardText}>{t("collection.reward", { keys: set.keys })}</Text>
										</View>
										{set.claimed ? (
											<Text style={styles.done}>{t("collection.done")}</Text>
										) : ready ? (
											<StylizedButton text={claiming === set.id ? "..." : t("collection.claim")} onClick={() => void claim(set)} backgroundColor="#B8860B" style={styles.claim} textStyle={styles.claimText} disabled={claiming !== null} />
										) : null}
									</View>
								</Animated.View>
							);
						})}
					</ScrollView>
					<StylizedButton text={t("shop.close")} onClick={onClose} backgroundColor="rgba(255,255,255,0.1)" style={styles.close} textStyle={styles.claimText} />
				</Pressable>
			</Pressable>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.75)",
		alignItems: "center",
		justifyContent: "center",
		padding: 14,
	},
	card: {
		width: "100%",
		maxWidth: 440,
		maxHeight: "90%",
		gap: 10,
		padding: 16,
		borderRadius: 16,
		borderWidth: 1,
		borderColor: "rgba(255,201,60,0.45)",
	},
	title: {
		fontFamily: "Silkscreen",
		fontSize: 20,
		textAlign: "center",
	},
	total: {
		fontFamily: "Silkscreen",
		fontSize: 14,
		textAlign: "center",
	},
	rarities: {
		gap: 5,
	},
	rarity: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	rarityName: {
		width: 92,
		fontFamily: "Silkscreen",
		fontSize: 11,
	},
	rarityCount: {
		width: 58,
		textAlign: "right",
		fontFamily: "Silkscreen",
		fontSize: 11,
		color: "#D4D4D8",
	},
	bar: {
		flex: 1,
		height: 7,
		borderRadius: 4,
		overflow: "hidden",
		backgroundColor: "rgba(255,255,255,0.08)",
	},
	barFill: {
		height: "100%",
		borderRadius: 4,
	},
	note: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		lineHeight: 15,
		textAlign: "center",
	},
	list: {
		flexGrow: 0,
	},
	listContent: {
		gap: 8,
		paddingBottom: 4,
	},
	set: {
		gap: 6,
		padding: 10,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.1)",
		backgroundColor: "rgba(255,255,255,0.04)",
	},
	setHead: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	setName: {
		flex: 1,
		fontFamily: "Silkscreen",
		fontSize: 13,
	},
	setCount: {
		fontFamily: "Silkscreen",
		fontSize: 12,
		color: "#D4D4D8",
	},
	setFoot: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		minHeight: 26,
	},
	reward: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
	},
	rewardText: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		color: "#FFD700",
	},
	done: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		color: "#4ADE80",
	},
	claim: {
		minWidth: 0,
		height: 30,
		paddingHorizontal: 14,
		margin: 0,
		borderRadius: 8,
	},
	claimText: {
		fontSize: 12,
	},
	close: {
		alignSelf: "stretch",
		minWidth: 0,
		height: 42,
		margin: 0,
		borderRadius: 10,
	},
});
