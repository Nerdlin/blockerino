import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
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

const CATEGORIES: { id: ShopCategory; label: string }[] = [
	{ id: "piece_skin", label: "Pieces" },
	{ id: "background", label: "Background" },
	{ id: "music", label: "Music" },
	{ id: "sfx", label: "Sounds" },
];

export default function ShopMenu() {
	const [setAppState] = useSetAppState();
	const { currentTheme } = useTheme();
	const { state, equip, purchaseAndEquip } = useShopState();
	const { playSfx } = useSoundSettings();
	const { width } = useWindowDimensions();
	const isMobile = width < 620;
	const [activeCategory, setActiveCategory] = useState<ShopCategory>("piece_skin");
	const [message, setMessage] = useState("Earn coins after solo games. Spend them here.");

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
			setMessage(isOwned ? `${item.title} equipped.` : `${item.title} bought and equipped.`);
		} else {
			playSfx("invalidPlacement");
			setMessage(result.error ?? "Could not buy this item.");
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
						text="Back"
						onClick={close}
						backgroundColor={currentTheme.buttonSecondary}
						style={styles.topBackButton}
						textStyle={styles.topBackButtonText}
					/>
					<View style={styles.headerTitleBlock}>
						<Text style={[styles.title, { color: currentTheme.textPrimary }]}>Shop</Text>
						<Text style={[styles.balance, { color: currentTheme.accent }]}>Coins: {state.balance}</Text>
					</View>
					<View style={styles.topBarSpacer} />
				</View>
				<Text style={[styles.caption, { color: currentTheme.textSecondary }]}>{message}</Text>
			</View>

			<View style={styles.tabs}>
				{CATEGORIES.map((category) => {
					const selected = activeCategory === category.id;
					return (
						<Pressable
							key={category.id}
							onPress={() => handleSelectCategory(category.id)}
							style={[
								styles.tab,
								{
									borderColor: selected ? currentTheme.accent : "rgba(255,255,255,0.15)",
									backgroundColor: selected ? currentTheme.buttonPrimary : "rgba(255,255,255,0.06)",
								},
							]}
						>
							<Text style={[styles.tabText, { color: selected ? "white" : currentTheme.textSecondary }]}>
								{category.label}
							</Text>
						</Pressable>
					);
				})}
			</View>

			<View style={styles.equippedRow}>
				<Text style={[styles.equippedLabel, { color: currentTheme.textSecondary }]}>Equipped</Text>
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
					/>
				))}
			</View>

			<Text style={[styles.catalogCount, { color: currentTheme.textSecondary }]}>
				{visibleCatalogCount} cosmetics available
			</Text>

			<StylizedButton
				text="Back"
				onClick={close}
				backgroundColor={currentTheme.buttonSecondary}
				style={isMobile && styles.mobileBackButton}
				textStyle={isMobile && styles.mobileBackButtonText}
			/>
		</SimplePopupView>
	);
}

function ShopItemCard({
	item,
	isOwned,
	isEquipped,
	canAfford,
	onPress,
}: {
	item: ShopItem;
	isOwned: boolean;
	isEquipped: boolean;
	canAfford: boolean;
	onPress: () => void;
}) {
	const { currentTheme } = useTheme();
	const buttonText = isEquipped ? "Equipped" : isOwned ? "Equip" : item.price === 0 ? "Equip" : `Buy ${item.price}`;
	const disabled = isEquipped || (!isOwned && !canAfford);

	return (
		<View style={[
			styles.card,
			{
				borderColor: isEquipped ? item.accent : "rgba(255,255,255,0.12)",
				backgroundColor: "rgba(0, 0, 0, 0.38)",
			},
		]}>
			<CosmeticPreview item={item} />
			<Text style={[styles.itemTitle, { color: currentTheme.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
				{item.title}
			</Text>
			<Text style={[styles.itemDescription, { color: currentTheme.textSecondary }]} numberOfLines={3}>
				{item.description}
			</Text>
			<Text style={[styles.itemStatus, { color: isOwned ? item.accent : currentTheme.textSecondary }]}>
				{isOwned ? "Owned" : `${item.price} coins`}
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

function CosmeticPreview({ item }: { item: ShopItem }) {
	if (item.category === "background" && item.gradient) {
		return (
			<View style={styles.previewBox}>
				{item.gradient.map((color, index) => (
					<View key={`${item.id}-${index}`} style={[styles.previewStripe, { backgroundColor: color }]} />
				))}
			</View>
		);
	}

	if (item.category === "music") {
		return (
			<View style={[styles.previewBox, styles.audioPreview]}>
				{item.previewColors.map((color, index) => (
					<View
						key={`${item.id}-${index}`}
						style={[
							styles.musicBar,
							{ backgroundColor: color, height: 12 + index * 8 },
						]}
					/>
				))}
			</View>
		);
	}

	if (item.category === "sfx") {
		return (
			<View style={[styles.previewBox, styles.audioPreview]}>
				{item.previewColors.map((color, index) => (
					<View
						key={`${item.id}-${index}`}
						style={[
							styles.soundDot,
							{ backgroundColor: color, transform: [{ scale: 1 + index * 0.18 }] },
						]}
					/>
				))}
			</View>
		);
	}

	return (
		<View style={styles.previewBox}>
			<View style={styles.blockPreviewRow}>
				{item.previewColors.map((color, index) => (
					<View key={`${item.id}-${index}`} style={[styles.blockPreview, { backgroundColor: color }]} />
				))}
			</View>
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
		fontSize: 28,
		textAlign: "center",
	},
	balance: {
		fontFamily: "Silkscreen",
		fontSize: 18,
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
		marginBottom: 12,
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
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "center",
		gap: 10,
	},
	mobileItemsGrid: {
		gap: 8,
	},
	card: {
		width: 190,
		minHeight: 230,
		borderWidth: 2,
		borderRadius: 8,
		padding: 10,
		alignItems: "center",
		justifyContent: "space-between",
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
		minHeight: 42,
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
