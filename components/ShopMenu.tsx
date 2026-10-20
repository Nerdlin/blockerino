import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import SegmentedControl from "./SegmentedControl";
import CosmeticPreview from "./CosmeticPreview";
import ShopPreviewModal from "./ShopPreviewModal";
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

const CATEGORIES: { id: ShopCategory; labelKey: string }[] = [
	{ id: "piece_skin", labelKey: "shop.category.pieces" },
	{ id: "background", labelKey: "shop.category.background" },
	{ id: "music", labelKey: "shop.category.music" },
	{ id: "sfx", labelKey: "shop.category.sounds" },
];

export default function ShopMenu() {
	const [setAppState] = useSetAppState();
	const { currentTheme } = useTheme();
	const { state, equip, purchaseAndEquip } = useShopState();
	const { playSfx } = useSoundSettings();
	const { t } = useLanguage();
	const { width } = useWindowDimensions();
	const isMobile = width < 620;
	const [activeCategory, setActiveCategory] = useState<ShopCategory>("piece_skin");
	const [message, setMessage] = useState(t("shop.caption"));
	const [previewItem, setPreviewItem] = useState<ShopItem | null>(null);

	const items = useMemo(
		() => getVisibleShopItemsByCategory(activeCategory, state.ownedItemIds),
		[activeCategory, state.ownedItemIds]
	);
	const visibleCatalogCount = useMemo(
		() => CATEGORIES.reduce((total, category) => (
			total + getVisibleShopItemsByCategory(category.id, state.ownedItemIds).length
		), 0),
		[state.ownedItemIds]
	);
	const equippedItem = getEquippedShopItem(state, activeCategory);

	const close = () => {
		playSfx("menuClick");
		setAppState(MenuStateType.MENU);
	};

	useEscapeKey(close);

	const handleSelectCategory = (category: ShopCategory) => {
		playSfx("menuClick");
		setActiveCategory(category);
	};

	const handleItemPress = async (item: ShopItem) => {
		const isOwned = state.ownedItemIds.includes(item.id);
		const result = isOwned ? await equip(item.id) : await purchaseAndEquip(item.id);

		if (result.ok) {
			playSfx("menuClick");
			setMessage(isOwned ? t("shop.equippedMsg", { name: item.title }) : t("shop.boughtMsg", { name: item.title }));
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
						<Text style={[styles.balance, { color: currentTheme.accent }]}>{state.balance}</Text>
					</View>
				</View>
				<Text style={[styles.caption, { color: currentTheme.textSecondary }]}>{message}</Text>
			</View>

			<SegmentedControl
				items={CATEGORIES.map((category) => ({ key: category.id, label: t(category.labelKey) }))}
				value={activeCategory}
				onChange={handleSelectCategory}
				small
			/>

			<View style={styles.equippedRow}>
				<Text style={[styles.equippedLabel, { color: currentTheme.textSecondary }]}>{t("shop.equipped")}</Text>
				<Text style={[styles.equippedValue, { color: currentTheme.textPrimary }]} numberOfLines={1}>
					{equippedItem.title}
				</Text>
			</View>

			<View style={[styles.itemsGrid, isMobile && styles.mobileItemsGrid]}>
				{items.map((item) => (
					<ShopItemCard
						key={item.id}
						item={item}
						isOwned={state.ownedItemIds.includes(item.id)}
						isEquipped={state.equipped[item.category] === item.id}
						canAfford={state.balance >= item.price}
						onPress={() => handleItemPress(item)}
						onPreview={() => setPreviewItem(item)}
					/>
				))}
			</View>

			<ShopPreviewModal
				item={previewItem}
				owned={previewItem ? state.ownedItemIds.includes(previewItem.id) : false}
				equipped={previewItem ? state.equipped[previewItem.category] === previewItem.id : false}
				canAfford={previewItem ? state.balance >= previewItem.price : false}
				onConfirm={async (item) => { await handleItemPress(item); setPreviewItem(null); }}
				onClose={() => setPreviewItem(null)}
			/>

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
	const { t } = useLanguage();
	const buttonText = isEquipped
		? t("shop.equipped")
		: isOwned || item.price === 0
			? t("shop.equip")
			: t("shop.buy", { price: item.price });
	const disabled = isEquipped || (!isOwned && !canAfford);

	return (
		<View style={[
			styles.card,
			{
				borderColor: isEquipped ? item.accent : "rgba(255,255,255,0.12)",
				backgroundColor: "rgba(0, 0, 0, 0.38)",
			},
		]}>
			<Pressable onPress={onPreview} accessibilityLabel={item.title} style={styles.previewTap}>
				<CosmeticPreview item={item} />
			</Pressable>
			<Text style={[styles.itemTitle, { color: currentTheme.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
				{item.title}
			</Text>
			<Text style={[styles.itemDescription, { color: currentTheme.textSecondary }]} numberOfLines={2}>
				{item.description}
			</Text>
			<Text style={[styles.itemStatus, { color: isOwned ? item.accent : currentTheme.textSecondary }]}>
				{isOwned ? t("shop.owned") : t("shop.price", { price: item.price })}
			</Text>
			<StylizedButton
				text={buttonText}
				onClick={onPress}
				backgroundColor={isOwned ? item.accent : currentTheme.buttonPrimary}
				disabled={disabled}
				style={styles.cardButton}
				textStyle={styles.cardButtonText}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
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
		justifyContent: "space-between",
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
		maxWidth: 240,
		textAlign: "right",
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
	card: {
		width: "47%",
		minWidth: 150,
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
		marginTop: 8,
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
