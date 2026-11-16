import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { supabase } from "@/constants/Supabase";
import { useLanguage } from "@/constants/Localization";
import { gameAlert } from "@/constants/GameDialog";
import { getShopItem, loadShopState, useShopState } from "@/constants/Shop";
import { shopItemText } from "@/constants/i18n/shopItems";
import { claimGifts } from "@/constants/Gifts";
import { MenuStateType, useAppStateValue } from "@/hooks/useAppState";

/**
 * Gifts from friends. The server has already put the item or the key on the account (send_gift); this only tells
 * the player, once, in the menu: on start, when the app comes back and after signing in.
 */
export default function GiftHost() {
	const { t, language } = useLanguage();
	const { commit } = useShopState();
	const appState = useAppStateValue();
	const inMenu = appState.current === MenuStateType.MENU;
	const running = useRef(false);
	const commitRef = useRef(commit);
	commitRef.current = commit;
	const textRef = useRef({ t, language });
	textRef.current = { t, language };

	const check = useCallback(async () => {
		if (running.current) return;
		running.current = true;
		try {
			const claim = await claimGifts();
			if (!claim || claim.gifts.length === 0) return;
			const latest = await loadShopState();
			await commitRef.current({ ...latest, ownedItemIds: Array.from(new Set([...latest.ownedItemIds, ...claim.ownedItemIds])) }, []);
			const { t: text, language: lang } = textRef.current;
			const lines = claim.gifts.map((gift) => {
				const item = gift.itemId ? getShopItem(gift.itemId) : undefined;
				return gift.kind === "chest" || !item
					? text("gift.gotChest", { name: gift.fromName })
					: text("gift.gotItem", { name: gift.fromName, gift: shopItemText(item, lang).title });
			});
			gameAlert(text("gift.gotTitle"), lines.join("\n"));
		} finally {
			running.current = false;
		}
	}, []);

	useEffect(() => {
		if (!inMenu) return;
		const timer = setTimeout(() => void check(), 3500);
		return () => clearTimeout(timer);
	}, [inMenu, check]);

	useEffect(() => {
		const appStateSub = AppState.addEventListener("change", (next) => {
			if (next === "active") void check();
		});
		const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
			if (event === "SIGNED_IN") void check();
		});
		return () => {
			appStateSub.remove();
			authSub.subscription.unsubscribe();
		};
	}, [check]);

	return null;
}
