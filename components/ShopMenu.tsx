import { useMemo, useState } from "react";
import AnimatedNumber from "./AnimatedNumber";
import FadeInView from "./FadeInView";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import SegmentedControl from "./SegmentedControl";
import CosmeticPreview from "./CosmeticPreview";
import ShopPreviewModal from "./ShopPreviewModal";
import ChestShop from "./ChestShop";
import CollectionMenu from "./CollectionMenu";
import { useCollectionSummary } from "@/constants/Collection";
import { MenuStateType, useSetAppState } from "@/hooks/useAppState";
import { useTheme } from "@/constants/Theme";
import {
	ShopCategory,
	ShopItem,
	getEquippedShopItem,
	getVisibleShopItemsByCategory,
	useShopState,
} from "@/constants/Shop";
import { useSoundSettings } from "@/constants/Sound";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useLanguage } from "@/constants/Localization";
import { shopItemText } from "@/constants/i18n/shopItems";
import { itemRarity } from "@/constants/Chests";
import { RARITY_COLORS, type Rarity } from "@/constants/DailyReward";

type ShopTab = ShopCategory | "chests";

const CATEGORIES: { id: ShopTab; labelKey: string }[] = [
	{ id: "piece_skin", labelKey: "shop.category.pieces" },
	{ id: "background", labelKey: "shop.category.background" },
	{ id: "music", labelKey: "shop.category.music" },
	{ id: "sfx", labelKey: "shop.category.sounds" },
	{ id: "chests", labelKey: "shop.category.chests" },
];

export default function ShopMenu() {
	const [setAppState, appendAppState] = useSetAppState();
	const { currentTheme } = useTheme();
	const { state, equip, purchaseAndEquip } = useShopState();
	const { playSfx } = useSoundSettings();
	const { t, language } = useLanguage();
	const { width } = useWindowDimensions();
	const isMobile = width < 620;
	const [activeTab, setActiveTab] = useState<ShopTab>("piece_skin");
	const activeCategory: ShopCategory = activeTab === "chests" ? "piece_skin" : activeTab;
	const [message, setMessage] = useState(t("shop.caption"));
	const [previewItem, setPreviewItem] = useState<ShopItem | null>(null);
	const [collectionOpen, setCollectionOpen] = useState(false);
	const collection = useCollectionSummary(state.ownedItemIds);
	const toPass = () => {
		playSfx("menuClick");
		setPreviewItem(null);
		appendAppState(MenuStateType.SEASON_PASS);
	};
	const toChests = () => {
		playSfx("menuClick");
		setPreviewItem(null);
		setActiveTab("chests");
	};

	// filters: owned or not, one rarity, cheapest first; they reset with the tab
	const [ownedFilter, setOwnedFilter] = useState<"all" | "owned" | "notOwned">("all");
	const [rarityFilter, setRarityFilter] = useState<Rarity | null>(null);
	const [cheapFirst, setCheapFirst] = useState(false);
	const allItems = useMemo(
		() => getVisibleShopItemsByCategory(activeCategory, state.ownedItemIds),
		[activeCategory, state.ownedItemIds]
	);
	const items = useMemo(() => {
		const owned = new Set(state.ownedItemIds);
		const list = allItems.filter((item) => {
			if (ownedFilter === "owned" && !owned.has(item.id)) return false;
			if (ownedFilter === "notOwned" && owned.has(item.id)) return false;
			if (rarityFilter && (item.seasonOnly || itemRarity(item.price) !== rarityFilter)) return false;
			return true;
		});
		return cheapFirst ? [...list].sort((a, b) => a.price - b.price) : list;
	}, [allItems, state.ownedItemIds, ownedFilter, rarityFilter, cheapFirst]);
	const visibleCatalogCount = useMemo(
		() => CATEGORIES.reduce((total, category) => (
			total + (category.id === "chests" ? 0 : getVisibleShopItemsByCategory(category.id, state.ownedItemIds).length)
		), 0),
		[state.ownedItemIds]
	);
	const equippedItem = getEquippedShopItem(state, activeCategory);

	const close = () => {
		playSfx("menuClick");
		setAppState(MenuStateType.MENU);
	};

	useEscapeKey(close);

	const handleSelectCategory = (category: ShopTab) => {
		playSfx("menuClick");
		setActiveTab(category);
	};

	const handleItemPress = async (item: ShopItem) => {
		const isOwned = state.ownedItemIds.includes(item.id);
		const result = isOwned ? await equip(item.id) : await purchaseAndEquip(item.id);

		if (result.ok) {
			playSfx("menuClick");
			setMessage(isOwned ? t("shop.equippedMsg", { name: shopItemText(item, language).title }) : t("shop.boughtMsg", { name: shopItemText(item, language).title }));
		} else {
			playSfx("invalidPlacement");
			setMessage(result.error ?? t("shop.couldNotBuy"));
		}
	};

	return (
		<SimplePopupView style={[
			{ backgroundColor: currentTheme.menuBackground },
			isMobile && { width: "94%", height: "88%" },
		]}>
			<View style={styles.header}>
				<View style={styles.topBar}>
					<StylizedButton
						text={t("shop.back")}
						onClick={close}
						backgroundColor={currentTheme.buttonSecondary}
						style={styles.topBackButton}
						textStyle={styles.topBackButtonText}
					/>
					<Text style={[styles.title, { color: currentTheme.textPrimary }]}>{t("shop.title")}</Text>
					<View style={[styles.coinsPill, { borderColor: currentTheme.accent }]}>
						<AnimatedNumber value={state.balance} style={[styles.balance, { color: currentTheme.accent }]} />
					</View>
				</View>
				<Text style={[styles.caption, { color: currentTheme.textSecondary }]}>{message}</Text>
				<Pressable
					onPress={() => { playSfx("menuClick"); setCollectionOpen(true); }}
					accessibilityRole="button"
					style={[styles.collectionPill, collection.claimable > 0 && styles.collectionPillReady]}
				>
					<Text style={[styles.collectionText, collection.claimable > 0 && { color: "#FFD700" }]}>
						{t("collection.pill", { owned: collection.owned, total: collection.total })}
						{collection.claimable > 0 ? ` · ${t("collection.ready", { count: collection.claimable })}` : ""}
					</Text>
				</Pressable>
			</View>

			<SegmentedControl
				items={CATEGORIES.map((category) => ({ key: category.id, label: t(category.labelKey) }))}
				value={activeTab}
				onChange={handleSelectCategory}
				small
			/>

			{activeTab === "chests" ? <ChestShop /> : (<>
			<View style={styles.equippedRow}>
				<Text style={[styles.equippedValue, { color: currentTheme.textPrimary }]} numberOfLines={1}>
					<Text style={{ color: currentTheme.textSecondary }}>{t("shop.equipped")}: </Text>
					{shopItemText(equippedItem, language).title}
				</Text>
			</View>

			<View style={styles.filters}>
				<SegmentedControl
					small
					items={[{ key: "all", label: t("shop.filter.all") }, { key: "owned", label: t("shop.filter.owned") }, { key: "notOwned", label: t("shop.filter.notOwned") }]}
					value={ownedFilter}
					onChange={(key) => { playSfx("menuClick"); setOwnedFilter(key as "all" | "owned" | "notOwned"); }}
				/>
				<View style={styles.chipRow}>
					{(["common", "rare", "epic", "legendary"] as Rarity[]).map((rarity) => {
						const active = rarityFilter === rarity;
						const color = RARITY_COLORS[rarity];
						return (
							<Pressable
								key={rarity}
								accessibilityRole="button"
								accessibilityState={{ selected: active }}
								onPress={() => { playSfx("menuClick"); setRarityFilter(active ? null : rarity); }}
								style={[styles.chip, { borderColor: color }, active && { backgroundColor: `${color}33` }]}
							>
								<Text style={[styles.chipText, { color }]}>{t(`chest.kind.${rarity}`)}</Text>
							</Pressable>
						);
					})}
					<Pressable
						accessibilityRole="button"
						accessibilityState={{ selected: cheapFirst }}
						onPress={() => { playSfx("menuClick"); setCheapFirst((on) => !on); }}
						style={[styles.chip, { borderColor: currentTheme.textSecondary }, cheapFirst && { backgroundColor: "rgba(255,255,255,0.14)" }]}
					>
						<Text style={[styles.chipText, { color: currentTheme.textPrimary }]}>{t("shop.filter.cheapFirst")}</Text>
					</Pressable>
				</View>
			</View>

			{items.length === 0 ? <Text style={[styles.caption, { color: currentTheme.textSecondary, marginTop: 12 }]}>{t("shop.filter.empty")}</Text> : null}

			<View style={[styles.itemsGrid, isMobile && styles.mobileItemsGrid]}>
				{items.map((item, itemIndex) => (
					<FadeInView key={`${activeCategory}-${item.id}`} index={itemIndex} style={styles.cardSlot}>
					<ShopItemCard
						item={item}
						isOwned={state.ownedItemIds.includes(item.id)}
						isEquipped={state.equipped[item.category] === item.id}
						canAfford={state.balance >= item.price}
						onPress={() => (item.seasonOnly && !state.ownedItemIds.includes(item.id) ? toPass() : item.chestOnly && !state.ownedItemIds.includes(item.id) ? toChests() : handleItemPress(item))}
						onPreview={() => setPreviewItem(item)}
					/>
					</FadeInView>
				))}
			</View>
			</>)}

			<ShopPreviewModal
				item={previewItem}
				owned={previewItem ? state.ownedItemIds.includes(previewItem.id) : false}
				equipped={previewItem ? state.equipped[previewItem.category] === previewItem.id : false}
				canAfford={previewItem ? state.balance >= previewItem.price : false}
				onConfirm={async (item) => {
					if (item.seasonOnly && !state.ownedItemIds.includes(item.id)) return toPass();
					if (item.chestOnly && !state.ownedItemIds.includes(item.id)) return toChests();
					await handleItemPress(item);
					setPreviewItem(null);
				}}
				onClose={() => setPreviewItem(null)}
			/>

			{collectionOpen && <CollectionMenu onClose={() => setCollectionOpen(false)} />}

			<Text style={[styles.catalogCount, { color: currentTheme.textSecondary }]}>
				{t("shop.catalogCount", { count: visibleCatalogCount })}
			</Text>

		</SimplePopupView>
	);
}

function ShopItemCard({
	item,
	isOwned,
	isEquipped,
	canAfford,
	onPress,
	onPreview,
}: {
	item: ShopItem;
	isOwned: boolean;
	isEquipped: boolean;
	canAfford: boolean;
	onPress: () => void;
	onPreview: () => void;
}) {
	const { currentTheme } = useTheme();
	const { t, language } = useLanguage();
	const seasonOnly = item.seasonOnly === true && !isOwned;
	const chestOnly = item.chestOnly === true && !isOwned;
	const buttonText = isEquipped
		? t("shop.equipped")
		: seasonOnly
			? t("shop.toPass")
			: isOwned || item.price === 0
				? t("shop.equip")
				: chestOnly
					? t("shop.toChests")
					: t("shop.buy", { price: item.price });
	const disabled = isEquipped || (!isOwned && !chestOnly && !seasonOnly && !canAfford);
	// the rarity the chests and the collection use (set by the price), so the shop says it too
	const rarity = itemRarity(item.price);
	// a season-pass exclusive has no price to rate: it is marked with the season instead, in gold
	const rarityColor = item.seasonOnly ? "#FFC93C" : RARITY_COLORS[rarity];
	const tagText = item.seasonOnly ? t("shop.seasonTag") : t(`chest.kind.${rarity}`);

	return (
		<View style={[
			styles.card,
			{
				borderColor: isEquipped ? item.accent : rarity === "common" && !item.seasonOnly ? "rgba(255,255,255,0.12)" : `${rarityColor}88`,
				backgroundColor: "rgba(0, 0, 0, 0.38)",
			},
		]}>
			<View style={[styles.rarityTag, { borderColor: rarityColor, backgroundColor: `${rarityColor}22` }]}>
				<Text style={[styles.rarityText, { color: rarityColor }]}>{tagText}</Text>
			</View>
			<Pressable onPress={onPreview} accessibilityLabel={shopItemText(item, language).title} style={styles.previewTap}>
				<CosmeticPreview item={item} /* animations play in the preview window only: dozens of animated cards stuttered while scrolling */ />
			</Pressable>
			<Text style={[styles.itemTitle, { color: currentTheme.textPrimary }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
				{shopItemText(item, language).title}
			</Text>
			<Text style={[styles.itemDescription, { color: currentTheme.textSecondary }]} numberOfLines={2}>
				{shopItemText(item, language).description}
			</Text>
			<Text style={[styles.itemStatus, { color: isOwned ? item.accent : chestOnly || seasonOnly ? "#FFC93C" : currentTheme.textSecondary }]}>
				{isOwned ? t("shop.owned") : seasonOnly ? t("shop.seasonOnly") : chestOnly ? t("shop.chestOnly") : null}
			</Text>
			<StylizedButton
				text={buttonText}
				onClick={onPress}
				backgroundColor={isOwned ? item.accent : chestOnly || seasonOnly ? "#B8860B" : currentTheme.buttonPrimary}
				disabled={disabled}
				style={styles.cardButton}
				textStyle={styles.cardButtonText}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	collectionPill: {
		paddingHorizontal: 12,
		paddingVertical: 5,
		borderRadius: 999,
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.16)",
		backgroundColor: "rgba(255,255,255,0.05)",
	},
	collectionPillReady: {
		borderColor: "rgba(255,215,0,0.7)",
		backgroundColor: "rgba(255,215,0,0.1)",
	},
	collectionText: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		color: "#D4D4D8",
	},
	header: {
		width: "100%",
		alignItems: "center",
		gap: 6,
		marginBottom: 12,
	},
	topBar: {
		width: "100%",
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
	},
	headerTitleBlock: {
		flex: 1,
		alignItems: "center",
	},
	topBackButton: {
		minWidth: 74,
		minHeight: 30,
		paddingHorizontal: 8,
		paddingVertical: 4,
		margin: 0,
	},
	topBackButtonText: {
		fontSize: 10,
	},
	topBarSpacer: {
		width: 74,
	},
	title: {
		fontFamily: "Silkscreen",
		fontSize: 22,
		textAlign: "center",
		flex: 1,
	},
	coinsPill: {
		minWidth: 74,
		height: 30,
		borderWidth: 1.5,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 8,
	},
	balance: {
		fontFamily: "Silkscreen",
		fontSize: 14,
		textAlign: "center",
	},
	caption: {
		fontFamily: "Silkscreen",
		fontSize: 10,
		textAlign: "center",
		lineHeight: 14,
		paddingHorizontal: 8,
	},
	tabs: {
		width: "100%",
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "center",
		gap: 8,
		marginBottom: 12,
	},
	tab: {
		borderWidth: 2,
		borderRadius: 8,
		paddingHorizontal: 10,
		paddingVertical: 8,
		minWidth: 88,
		alignItems: "center",
	},
	tabText: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		textAlign: "center",
	},
	equippedRow: {
		width: "100%",
		maxWidth: 430,
		flexDirection: "row",
		justifyContent: "center",
		alignItems: "center",
		marginTop: 12,
		marginBottom: 10,
		paddingHorizontal: 8,
	},
	equippedLabel: {
		fontFamily: "Silkscreen",
		fontSize: 11,
	},
	equippedValue: {
		fontFamily: "Silkscreen",
		fontSize: 12,
		maxWidth: "100%",
		textAlign: "center",
	},
	filters: {
		width: "100%",
		alignItems: "center",
		gap: 8,
		marginBottom: 8,
	},
	chipRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "center",
		gap: 6,
	},
	chip: {
		paddingHorizontal: 9,
		paddingVertical: 5,
		borderRadius: 8,
		borderWidth: 1.5,
	},
	chipText: {
		fontFamily: "Silkscreen",
		fontSize: 10,
	},
	itemsGrid: {
		width: "100%",
		maxWidth: 440,
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "center",
		gap: 10,
	},
	mobileItemsGrid: {
		gap: 8,
	},
	cardSlot: {
		width: "48%",
		minWidth: 120,
	},
	card: {
		width: "100%",
		minHeight: 210,
		borderWidth: 1.5,
		borderRadius: 10,
		padding: 10,
		alignItems: "center",
		justifyContent: "space-between",
	},
	previewTap: {
		width: "100%",
	},
	rarityTag: {
		alignSelf: "flex-start",
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 6,
		borderWidth: 1,
		marginBottom: 6,
	},
	rarityText: {
		fontFamily: "Silkscreen",
		fontSize: 9,
	},
	previewBox: {
		width: "100%",
		height: 50,
		borderRadius: 6,
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.16)",
		overflow: "hidden",
		backgroundColor: "rgba(255,255,255,0.04)",
		justifyContent: "center",
		alignItems: "center",
	},
	previewStripe: {
		flex: 1,
		width: "100%",
	},
	blockPreviewRow: {
		flexDirection: "row",
		gap: 6,
	},
	blockPreview: {
		width: 24,
		height: 24,
		borderWidth: 3,
		borderColor: "rgba(255,255,255,0.24)",
	},
	audioPreview: {
		flexDirection: "row",
		gap: 8,
	},
	musicBar: {
		width: 11,
		borderRadius: 4,
	},
	soundDot: {
		width: 13,
		height: 13,
		borderRadius: 7,
	},
	itemTitle: {
		fontFamily: "Silkscreen",
		fontSize: 13,
		textAlign: "center",
		textAlignVertical: "center",
		marginTop: 8,
		// room for a name on two lines, so the cards of a row stay the same height
		minHeight: 36,
	},
	itemDescription: {
		fontFamily: "Silkscreen",
		fontSize: 9,
		lineHeight: 13,
		textAlign: "center",
		minHeight: 28,
	},
	itemStatus: {
		fontFamily: "Silkscreen",
		fontSize: 10,
		textAlign: "center",
	},
	cardButton: {
		minWidth: 120,
		minHeight: 32,
		paddingHorizontal: 8,
	},
	cardButtonText: {
		fontSize: 12,
	},
	catalogCount: {
		fontFamily: "Silkscreen",
		fontSize: 10,
		marginTop: 12,
		marginBottom: 8,
	},
	mobileBackButton: {
		minWidth: 120,
		minHeight: 34,
	},
	mobileBackButtonText: {
		fontSize: 13,
	},
});
