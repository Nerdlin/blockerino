import { ShopCategory, useShopState, ShopItem, getVisibleShopItemsByCategory } from "@/constants/Shop";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { useState } from "react";
import { ScrollView, View, Text, Pressable } from "react-native";
import SegmentedControl from "../SegmentedControl";
import CosmeticPreview from "../CosmeticPreview";
import StylizedButton from "../StylizedButton";
import ShopPreviewModal from "../ShopPreviewModal";
import { styles } from "./styles";

export const EXTRA_CATEGORIES: { id: ShopCategory; labelKey: string }[] = [
	{ id: "chess_piece", labelKey: "moregames.shop.chessPieces" },
	{ id: "chess_board", labelKey: "moregames.shop.chessBoard" },
	{ id: "sea_skin", labelKey: "moregames.shop.seaSkins" },
	{ id: "card_skin", labelKey: "moregames.shop.cardSkins" },
	{ id: "sudoku_theme", labelKey: "moregames.shop.sudokuThemes" },
	{ id: "mahjong_theme", labelKey: "moregames.shop.mahjongThemes" },
];

export function ExtraGameShop() {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const { state, equip, purchaseAndEquip } = useShopState();
	const [message, setMessage] = useState(t("moregames.shopHint"));

	const [activeCategory, setActiveCategory] = useState<ShopCategory>("chess_piece");
	const [previewItem, setPreviewItem] = useState<ShopItem | null>(null);

	const handleItemPress = async (item: ShopItem) => {
		const isOwned = state.ownedItemIds.includes(item.id);
		const result = isOwned ? await equip(item.id) : await purchaseAndEquip(item.id);
		if (result.ok) {
			setMessage(isOwned ? t("shop.equippedMsg", { name: item.title }) : t("shop.boughtMsg", { name: item.title }));
		} else {
			setMessage(result.error ?? t("shop.couldNotBuy"));
		}
	};

	const items = getVisibleShopItemsByCategory(activeCategory, state.ownedItemIds);

	return (
		<ScrollView style={styles.moreList} contentContainerStyle={styles.shopContent}>
				<View style={{ alignItems: 'center', marginBottom: 12, gap: 6 }}>
					<View style={[styles.refreshIconButton, { width: undefined, minWidth: 74, paddingHorizontal: 10, borderColor: currentTheme.accent }]}>
						<Text style={[styles.shopHint, { color: currentTheme.accent, fontSize: 14 }]}>{state.balance}</Text>
					</View>
					<Text style={[styles.shopHint, { color: currentTheme.textSecondary }]}>{message}</Text>
				</View>

				<SegmentedControl
					small
					items={EXTRA_CATEGORIES.slice(0, 3).map((cat) => ({ key: cat.id, label: t(cat.labelKey) }))}
					value={activeCategory}
					onChange={setActiveCategory}
				/>
				<View style={{ height: 6 }} />
				<SegmentedControl
					small
					items={EXTRA_CATEGORIES.slice(3).map((cat) => ({ key: cat.id, label: t(cat.labelKey) }))}
					value={activeCategory}
					onChange={setActiveCategory}
				/>
				<View style={{ height: 14 }} />

			<View style={{ width: "100%", marginBottom: 24, alignItems: "center" }}>
				<View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10 }}>
					{items.map((item) => {
						const isOwned = state.ownedItemIds.includes(item.id);
						const isEquipped = state.equipped[item.category] === item.id;
						const canAfford = state.balance >= item.price;
						const buttonText = isEquipped ? t("shop.equipped") : isOwned || item.price === 0 ? t("shop.equip") : t("shop.buy", { price: item.price });
						const disabled = isEquipped || (!isOwned && !canAfford);

						return (
							<View key={item.id} style={[{ width: "48%", minWidth: 120, minHeight: 180, borderWidth: 1.5, borderRadius: 10, padding: 8, alignItems: "center", justifyContent: "space-between", borderColor: isEquipped ? item.accent : "rgba(255,255,255,0.12)", backgroundColor: "rgba(0, 0, 0, 0.38)" }]}>
								<Pressable onPress={() => setPreviewItem(item)} accessibilityLabel={item.title} style={{ width: "100%" }}>
										<CosmeticPreview item={item} />
									</Pressable>
									<Text style={{ fontFamily: "Silkscreen", fontSize: 11, textAlign: "center", marginTop: 8, color: currentTheme.textPrimary }} numberOfLines={1} adjustsFontSizeToFit>{item.title}</Text>
								<Text style={{ fontFamily: "Silkscreen", fontSize: 8, lineHeight: 11, textAlign: "center", minHeight: 34, color: currentTheme.textSecondary }} numberOfLines={3}>{item.description}</Text>
								<Text style={{ fontFamily: "Silkscreen", fontSize: 9, textAlign: "center", color: isOwned ? item.accent : currentTheme.textSecondary, marginBottom: 4 }}>
									{isOwned ? t("shop.owned") : t("shop.price", { price: item.price })}
								</Text>
								<StylizedButton text={buttonText} onClick={() => handleItemPress(item)} backgroundColor={isOwned ? item.accent : currentTheme.buttonPrimary} disabled={disabled} style={{ minWidth: 100, minHeight: 28, paddingHorizontal: 4, margin: 0 }} textStyle={{ fontSize: 10 }} />
							</View>
						);
					})}
				</View>
			</View>
			<ShopPreviewModal
				item={previewItem}
				owned={previewItem ? state.ownedItemIds.includes(previewItem.id) : false}
				equipped={previewItem ? state.equipped[previewItem.category] === previewItem.id : false}
				canAfford={previewItem ? state.balance >= previewItem.price : false}
				onConfirm={async (item) => { await handleItemPress(item); setPreviewItem(null); }}
				onClose={() => setPreviewItem(null)}
			/>
		</ScrollView>
	);
}