import { useCallback, useEffect, useRef, useState } from "react";
import FadeInView from "./FadeInView";
import { AppState, StyleSheet, Text, View } from "react-native";
import { useAtom } from "jotai";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import UiIcon from "./UiIcon";
import {useTheme, opaqueColor } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { supabase } from "@/constants/Supabase";
import { loadShopState, useShopState } from "@/constants/Shop";
import { MenuStateType, useAppStateValue } from "@/hooks/useAppState";
import { track } from "@/constants/Analytics";
import { enablePush, markPushOffered, shouldOfferPush } from "@/constants/Notifications";
import DailyCalendar, { PixelChest } from "./DailyCalendar";
import CosmeticPreview from "./CosmeticPreview";
import { getShopItem } from "@/constants/Shop";
import { shopItemText } from "@/constants/i18n/shopItems";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from "react-native-reanimated";
import {
	claimDailyReward,
	dailyRewardOpenAtom,
	dailyRewardStatusAtom,
	fetchDailyRewardStatus,
	type DailyRewardClaim,
	RARITY_COLORS,
} from "@/constants/DailyReward";

function utcDay(): string {
	return new Date().toISOString().slice(0, 10);
}

// The daily login reward: offered once per app run and UTC day from the main menu (never over a game),
// and reopened from the streak chip. The server keeps the streak and pays the coins; the wallet then
// adopts the balance the server answers with.
export default function DailyRewardHost() {
	const { t, language } = useLanguage();
	const { currentTheme } = useTheme();
	const { commit } = useShopState();
	const chestShake = useSharedValue(0);
	const chestScale = useSharedValue(1);
	const prizeIn = useSharedValue(0);
	const chestStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${chestShake.value}deg` }, { scale: chestScale.value }] }));
	const prizeStyle = useAnimatedStyle(() => ({ opacity: prizeIn.value, transform: [{ scale: 0.6 + 0.4 * prizeIn.value }] }));
	const appState = useAppStateValue();
	const [status, setStatus] = useAtom(dailyRewardStatusAtom);
	const [open, setOpen] = useAtom(dailyRewardOpenAtom);
	const [claim, setClaim] = useState<DailyRewardClaim | null>(null);
	const [busy, setBusy] = useState(false);
	const [failed, setFailed] = useState(false);
	// After the first reward on a phone, offer reminders once (never before the player got something good).
	const [offerPush, setOfferPush] = useState(false);
	const [pushNote, setPushNote] = useState<string | null>(null);
	const offeredDay = useRef<string | null>(null);
	const commitRef = useRef(commit);
	commitRef.current = commit;

	const refresh = useCallback(async () => {
		const next = await fetchDailyRewardStatus();
		setStatus(next);
		if (next && !next.claimedToday && offeredDay.current !== utcDay()) {
			offeredDay.current = utcDay();
			setOpen(true);
		}
	}, [setOpen, setStatus]);

	useEffect(() => {
		// After the season popup (2.5 s), so two popups do not stack.
		const startTimer = setTimeout(() => void refresh(), 4500);
		const appStateSub = AppState.addEventListener("change", (next) => {
			if (next === "active") void refresh();
		});
		const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
			if (event === "SIGNED_IN") void refresh();
			if (event === "SIGNED_OUT") {
				setStatus(null);
				setOpen(false);
			}
		});

		return () => {
			clearTimeout(startTimer);
			appStateSub.remove();
			authSub.subscription.unsubscribe();
		};
	}, [refresh, setOpen, setStatus]);

	if (!open || !status || appState.current !== MenuStateType.MENU) return null;

	const close = () => {
		setOpen(false);
		setClaim(null);
		setFailed(false);
		setOfferPush(false);
		setPushNote(null);
	};

	const onPushYes = async () => {
		await markPushOffered();
		const status = await enablePush();
		setOfferPush(false);
		if (status === "denied") setPushNote(t("notif.pushDenied"));
		else if (status === "error") setPushNote(t("notif.pushError"));
	};

	const onPushNo = () => {
		void markPushOffered();
		setOfferPush(false);
	};

	const onClaim = async () => {
		if (busy) return;
		setBusy(true);
		setFailed(false);
		const result = await claimDailyReward();
		setBusy(false);
		if (!result) {
			setFailed(true);
			return;
		}

		const { claim: won } = result;
		if (won.coins !== null || won.ownedItemIds) {
			const latest = await loadShopState();
			await commitRef.current({
				...latest,
				balance: won.coins ?? latest.balance,
				ownedItemIds: won.ownedItemIds ? Array.from(new Set([...latest.ownedItemIds, ...won.ownedItemIds])) : latest.ownedItemIds,
			}, []);
		}
		setClaim(won);
		setStatus({ ...status!, streak: won.streak, best: won.best, claimedToday: true, nextStreak: won.streak + 1, nextReward: won.nextReward });
		if (won.chest) {
			// the chest shakes, swells and pops open, then the prize grows out of it
			chestShake.value = withSequence(withTiming(-12, { duration: 70 }), withTiming(12, { duration: 70 }), withTiming(-10, { duration: 70 }), withTiming(10, { duration: 70 }), withTiming(0, { duration: 70 }));
			chestScale.value = withSequence(withDelay(350, withTiming(1.25, { duration: 160 })), withSpring(1));
			prizeIn.value = 0;
			prizeIn.value = withDelay(650, withTiming(1, { duration: 320 }));
		}
		if (result.state === "claimed") {
			track("streak_claim", { streak: won.streak, reward: won.reward });
			if (await shouldOfferPush()) setOfferPush(true);
		}
	};

	const claimedNow = claim !== null;
	const alreadyClaimed = status.claimedToday && !claimedNow;
	const shownStreak = claim ? claim.streak : alreadyClaimed ? status.streak : status.nextStreak;

	const today = claimedNow || alreadyClaimed ? shownStreak : status.nextStreak;
	const collected = claimedNow || alreadyClaimed ? shownStreak : status.streak;
	const weekdays = t("daily.weekdays").split(",");
	const chest = claim?.chest ?? null;
	const chestItem = chest?.kind === "item" ? getShopItem(chest.itemId) : undefined;
	const daysToChest = (() => {
		const next = status.calendar.find((entry) => entry.chest && entry.day >= (claimedNow || alreadyClaimed ? shownStreak + 1 : status.nextStreak));
		return next ? next.day - (claimedNow || alreadyClaimed ? shownStreak : status.nextStreak - 1) : null;
	})();

	return (
		<SimplePopupView style={[{ backgroundColor: opaqueColor(currentTheme.menuBackground) }]}>
			<View style={styles.flame}>
				<UiIcon name="fire" size={36} />
			</View>
			<Text style={[styles.title, { color: currentTheme.buttonPrimary }]}>{t("daily.title")}</Text>
			<Text style={[styles.note, { color: currentTheme.textSecondary, marginBottom: 10 }]}>{t("daily.rules")}</Text>

			{chest ? (
				<View style={styles.chestReveal}>
					<Animated.View style={[styles.burst, { backgroundColor: RARITY_COLORS[chest.rarity] }, prizeStyle]} />
					<Animated.View style={chestStyle}>
						<PixelChest size={chest.size === "big" ? 96 : 72} kind={chest.size} open />
					</Animated.View>
					<Animated.View style={[styles.prize, prizeStyle]}>
						{chest.kind === "item" && (
							<Text style={[styles.rarity, { color: RARITY_COLORS[chest.rarity] }]}>{t(`daily.rarity.${chest.rarity}`)}</Text>
						)}
						{chestItem ? (
							<>
								<CosmeticPreview item={chestItem} />
								<Text style={[styles.reward, { color: "#FFD700" }]}>{t("daily.chestItem", { name: shopItemText(chestItem, language).title })}</Text>
								{chest.coins > 0 && <Text style={[styles.line, { color: "#FFD700" }]}>{t("daily.reward", { coins: chest.coins })}</Text>}
							</>
						) : (
							<Text style={[styles.reward, { color: "#FFD700" }]}>{t("daily.chestCoins", { coins: chest.coins })}</Text>
						)}
					</Animated.View>
				</View>
			) : (
				<DailyCalendar calendar={status.calendar} collected={collected} today={today} weekdays={weekdays} />
			)}

			<View style={styles.block}>
				<Text style={[styles.line, { color: currentTheme.textPrimary }]}>{t("daily.streakDay", { days: shownStreak })}</Text>
				{claimedNow ? (
					<>
						<FadeInView pop><Text style={[styles.reward, { color: "#FFD700" }]}>{t("daily.claimed", { coins: claim.reward })}</Text></FadeInView>
						<Text style={[styles.note, { color: currentTheme.textSecondary }]}>{t("daily.comeBack", { coins: claim.nextReward })}</Text>
					</>
				) : alreadyClaimed ? (
					<Text style={[styles.note, { color: currentTheme.textSecondary }]}>{t("daily.comeBack", { coins: status.nextReward })}</Text>
				) : status.nextChest ? (
					<Text style={[styles.reward, { color: "#FFD700" }]}>{t(status.nextChest === "big" ? "daily.bigChestToday" : "daily.chestToday")}</Text>
				) : (
					<Text style={[styles.reward, { color: "#FFD700" }]}>{t("daily.reward", { coins: status.nextReward })}</Text>
				)}
				{!chest && daysToChest !== null && daysToChest > 0 && (
					<Text style={[styles.note, { color: currentTheme.textSecondary }]}>{t("daily.toChest", { days: daysToChest })}</Text>
				)}
				{failed && <Text style={[styles.note, { color: "#FF6B6B" }]}>{t("daily.failed")}</Text>}
				{offerPush && <Text style={[styles.note, { color: currentTheme.textPrimary, marginTop: 8 }]}>{t("notif.pushOffer")}</Text>}
				{pushNote && <Text style={[styles.note, { color: currentTheme.textSecondary, marginTop: 8 }]}>{pushNote}</Text>}
			</View>

			<View style={styles.buttons}>
				{!claimedNow && !alreadyClaimed ? (
					<>
						<StylizedButton text={t(status.nextChest ? "daily.openChest" : "daily.claim")} onClick={() => void onClaim()} backgroundColor={currentTheme.buttonPrimary} />
						<StylizedButton text={t("daily.later")} onClick={close} backgroundColor={currentTheme.buttonSecondary} />
					</>
				) : offerPush ? (
					<>
						<StylizedButton text={t("notif.pushYes")} onClick={() => void onPushYes()} backgroundColor={currentTheme.buttonPrimary} />
						<StylizedButton text={t("notif.pushNo")} onClick={onPushNo} backgroundColor={currentTheme.buttonSecondary} />
					</>
				) : (
					<StylizedButton text={t("daily.ok")} onClick={close} backgroundColor={currentTheme.buttonPrimary} />
				)}
			</View>
		</SimplePopupView>
	);
}

const styles = StyleSheet.create({
	flame: {
		alignItems: "center",
		marginBottom: 8,
	},
	title: {
		fontFamily: "Silkscreen",
		fontSize: 24,
		textAlign: "center",
		marginBottom: 16,
	},
	block: {
		alignItems: "center",
		gap: 6,
		marginBottom: 16,
	},
	line: {
		fontFamily: "Silkscreen",
		fontSize: 16,
		textAlign: "center",
	},
	reward: {
		fontFamily: "Silkscreen",
		fontSize: 20,
		textAlign: "center",
	},
	note: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		textAlign: "center",
	},
	chestReveal: {
		alignItems: "center",
		gap: 10,
		marginVertical: 8,
	},
	prize: {
		alignItems: "center",
		gap: 6,
	},
	burst: {
		position: "absolute",
		top: -10,
		width: 150,
		height: 150,
		borderRadius: 75,
		opacity: 0.25,
	},
	rarity: {
		fontFamily: "Silkscreen",
		fontSize: 16,
		textAlign: "center",
	},
	buttons: {
		gap: 8,
		alignItems: "center",
		marginTop: 8,
	},
});
