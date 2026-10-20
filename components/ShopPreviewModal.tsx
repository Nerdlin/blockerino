import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import CosmeticPreview from "./CosmeticPreview";
import StylizedButton from "./StylizedButton";
import { cssColors } from "@/constants/Color";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import type { ShopItem } from "@/constants/Shop";

// Window that opens when a shop card is tapped: a bigger look at the item and the buy / equip action, so nobody
// has to spend coins to see what something looks like.
export default function ShopPreviewModal({
	item,
	owned,
	equipped,
	canAfford,
	onConfirm,
	onClose,
}: {
	item: ShopItem | null;
	owned: boolean;
	equipped: boolean;
	canAfford: boolean;
	onConfirm: (item: ShopItem) => void;
	onClose: () => void;
}) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	if (!item) return null;

	const free = item.price === 0;
	const actionText = equipped ? t("shop.equipped") : owned || free ? t("shop.equip") : t("shop.buy", { price: item.price });
	const disabled = equipped || (!owned && !free && !canAfford);

	return (
		<Modal transparent animationType="fade" visible onRequestClose={onClose}>
			<Pressable style={styles.backdrop} onPress={onClose}>
				<Pressable style={[styles.card, { borderColor: item.accent, backgroundColor: currentTheme.menuBackground }]} onPress={() => undefined}>
					<Text style={[styles.title, { color: currentTheme.textPrimary }]} numberOfLines={2}>{item.title}</Text>
					<View style={styles.preview}>
						<CosmeticPreview item={item} large />
					</View>
					<Text style={[styles.description, { color: currentTheme.textSecondary }]}>{item.description}</Text>
					<Text style={[styles.status, { color: owned ? item.accent : currentTheme.accent }]}>
						{owned ? t("shop.owned") : free ? t("shop.price", { price: 0 }) : t("shop.price", { price: item.price })}
					</Text>
					{!owned && !free && !canAfford && (
						<Text style={[styles.hint, { color: "#F87171" }]}>{t("shop.notEnough")}</Text>
					)}
					<View style={styles.buttons}>
						<StylizedButton
							text={actionText}
							onClick={() => onConfirm(item)}
							backgroundColor={owned || free ? item.accent : currentTheme.buttonPrimary}
							disabled={disabled}
							style={styles.button}
							textStyle={styles.buttonText}
						/>
						<StylizedButton
							text={t("shop.close")}
							onClick={onClose}
							backgroundColor={cssColors.spaceGray}
							style={styles.button}
							textStyle={styles.buttonText}
						/>
					</View>
				</Pressable>
			</Pressable>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: {
		flex: 1,
		backgroundColor: "rgba(0, 0, 0, 0.7)",
		alignItems: "center",
		justifyContent: "center",
		padding: 16,
	},
	card: {
		width: "100%",
		maxWidth: 360,
		borderWidth: 2,
		borderRadius: 14,
		padding: 16,
		alignItems: "center",
		gap: 10,
	},
	title: {
		fontFamily: "Silkscreen",
		fontSize: 18,
		textAlign: "center",
	},
	preview: {
		width: "100%",
	},
	description: {
		fontFamily: "Silkscreen",
		fontSize: 10,
		lineHeight: 15,
		textAlign: "center",
	},
	status: {
		fontFamily: "Silkscreen",
		fontSize: 13,
		textAlign: "center",
	},
	hint: {
		fontFamily: "Silkscreen",
		fontSize: 10,
		textAlign: "center",
	},
	buttons: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "center",
		gap: 8,
		marginTop: 4,
	},
	button: {
		minWidth: 120,
		minHeight: 38,
	},
	buttonText: {
		fontSize: 12,
	},
});
