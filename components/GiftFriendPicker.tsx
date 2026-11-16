import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import StylizedButton from "./StylizedButton";
import { opaqueColor, useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { loadShopState, useShopState, type ShopItem } from "@/constants/Shop";
import { shopItemText } from "@/constants/i18n/shopItems";
import { useSoundSettings } from "@/constants/Sound";
import { gameAlert } from "@/constants/GameDialog";
import { track } from "@/constants/Analytics";
import { CHEST_PRICES } from "@/constants/Chests";
import { fetchGiftFriends, sendGift, type GiftFriend } from "@/constants/Gifts";

export type GiftChoice = { kind: "item"; item: ShopItem } | { kind: "chest" };

/** Picks a friend for a gift, asks to confirm the price and sends it. Hidden while gift is null. */
export default function GiftFriendPicker({ gift, onClose, friend }: { gift: GiftChoice | null; onClose: () => void; friend?: GiftFriend }) {
	const { currentTheme } = useTheme();
	const { t, language } = useLanguage();
	const { commit } = useShopState();
	const { playSfx } = useSoundSettings();
	const [friends, setFriends] = useState<GiftFriend[] | null>(null);
	const [sending, setSending] = useState(false);

	useEffect(() => {
		if (!gift || friend) return;
		let active = true;
		setFriends(null);
		void fetchGiftFriends().then((list) => { if (active) setFriends(list); });
		return () => { active = false; };
	}, [gift, friend]);

	const price = gift ? (gift.kind === "chest" ? CHEST_PRICES.small : gift.item.price) : 0;
	const giftName = gift ? (gift.kind === "chest" ? t("chest.small") : shopItemText(gift.item, language).title) : "";

	const send = async (to: GiftFriend) => {
		if (!gift || sending) return;
		setSending(true);
		const result = await sendGift(to.id, gift.kind, gift.kind === "item" ? gift.item.id : undefined);
		setSending(false);
		if (result.coins !== null) {
			const latest = await loadShopState();
			await commit({ ...latest, balance: result.coins }, []);
		}
		if (result.status === "ok") {
			playSfx("menuClick");
			track("gift_send", { kind: gift.kind });
			gameAlert(t("gift.sentTitle"), t("gift.sent", { gift: giftName, name: to.name }));
			return;
		}
		playSfx("invalidPlacement");
		gameAlert(t("gift.title"), t(`gift.error.${result.status}`, { name: to.name }));
	};

	const confirm = (to: GiftFriend) => {
		playSfx("menuClick");
		// the list closes first: a game dialog would open behind this modal
		if (!friend) onClose();
		gameAlert(t("gift.confirmTitle"), t("gift.confirm", { gift: giftName, name: to.name, price }), [
			{ text: t("gift.cancel"), style: "cancel" },
			{ text: t("gift.send"), onPress: () => void send(to) },
		]);
	};

	useEffect(() => {
		if (gift && friend) {
			confirm(friend);
			onClose();
		}
		// the confirmation replaces the list when the friend is already chosen
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [gift, friend]);

	if (!gift || friend) return null;

	return (
		<Modal transparent animationType="fade" visible onRequestClose={onClose}>
			<Pressable style={styles.backdrop} onPress={onClose}>
				<Pressable style={[styles.card, { backgroundColor: opaqueColor(currentTheme.menuBackground) }]} onPress={() => undefined}>
					<Text style={[styles.title, { color: currentTheme.textPrimary }]}>{t("gift.pickFriend")}</Text>
					<Text style={[styles.note, { color: currentTheme.textSecondary }]}>{t("gift.pickNote", { gift: giftName, price })}</Text>
					{friends === null ? (
						<ActivityIndicator color={currentTheme.accent} style={styles.loader} />
					) : friends.length === 0 ? (
						<Text style={[styles.note, { color: currentTheme.textSecondary }]}>{t("gift.noFriends")}</Text>
					) : (
						<ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
							{friends.map((entry) => (
								<Pressable key={entry.id} disabled={sending} onPress={() => confirm(entry)} style={({ pressed }) => [styles.friend, pressed && styles.friendPressed]}>
									<Text style={styles.friendName} numberOfLines={1}>{entry.name}</Text>
									<Text style={styles.friendAction}>{t("gift.send")}</Text>
								</Pressable>
							))}
						</ScrollView>
					)}
					<StylizedButton text={t("gift.cancel")} onClick={onClose} backgroundColor="rgba(255,255,255,0.1)" style={styles.button} textStyle={styles.buttonText} />
				</Pressable>
			</Pressable>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.7)",
		alignItems: "center",
		justifyContent: "center",
		padding: 16,
	},
	card: {
		width: "100%",
		maxWidth: 380,
		maxHeight: "80%",
		gap: 10,
		padding: 16,
		borderRadius: 16,
		borderWidth: 1,
		borderColor: "rgba(167,139,250,0.6)",
	},
	title: {
		fontFamily: "Silkscreen",
		fontSize: 18,
		textAlign: "center",
	},
	note: {
		fontFamily: "Silkscreen",
		fontSize: 12,
		lineHeight: 17,
		textAlign: "center",
	},
	loader: {
		marginVertical: 16,
	},
	list: {
		flexGrow: 0,
	},
	listContent: {
		gap: 8,
	},
	friend: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 12,
		paddingVertical: 10,
		borderRadius: 10,
		backgroundColor: "rgba(255,255,255,0.06)",
	},
	friendPressed: {
		backgroundColor: "rgba(167,139,250,0.2)",
	},
	friendName: {
		flex: 1,
		fontFamily: "Silkscreen",
		fontSize: 14,
		color: "#FFFFFF",
	},
	friendAction: {
		fontFamily: "Silkscreen",
		fontSize: 12,
		color: "#C4B5FD",
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
