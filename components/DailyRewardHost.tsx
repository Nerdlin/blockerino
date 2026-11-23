import { celebrate } from "@/constants/Celebration";
import StreakFlame from "./StreakFlame";
import FreezeCrystal from "./FreezeCrystal";
import { CountUp } from "./ProfileDesign";
import { useCallback, useEffect, useRef, useState } from "react";
import FadeInView from "./FadeInView";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
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
import DailyCalendar from "./DailyCalendar";
import OfflineNotice from "./OfflineNotice";
import { isOnline, useOnlineStatus } from "@/constants/NetworkStatus";
import ChestRoulette from "./ChestRoulette";
import { ChestOdds, ChestPrizeCard, LuckyHourNote, useLuckyHour } from "./ChestParts";
import {
	buyStreakFreeze,
	claimDailyReward,
	dailyRewardOpenAtom,
	dailyRewardStatusAtom,
	fetchDailyRewardStatus,
	type DailyRewardClaim,
} from "@/constants/DailyReward";

function utcDay(): string {
	return new Date().toISOString().slice(0, 10);
}

// The daily login reward: offered once per app run and UTC day from the main menu (never over a game),
// and reopened from the streak chip. The server keeps the streak and pays the coins; the wallet then
// adopts the balance the server answers with.
export default function DailyRewardHost() {
	const { t } = useLanguage();
	const { currentTheme } = useTheme();
	const { commit } = useShopState();
	const lucky = useLuckyHour();
	// the chest's roulette has stopped: the prize card shows
	const [chestDone, setChestDone] = useState(false);
	const appState = useAppStateValue();
	const [status, setStatus] = useAtom(dailyRewardStatusAtom);
	const [open, setOpen] = useAtom(dailyRewardOpenAtom);
	const [claim, setClaim] = useState<DailyRewardClaim | null>(null);
	const [busy, setBusy] = useState(false);
	const [failed, setFailed] = useState(false);
	const [freezeNote, setFreezeNote] = useState<string | null>(null);
	// After the first reward on a phone, offer reminders once (never before the player got something good).
	const [offerPush, setOfferPush] = useState(false);
	const [pushNote, setPushNote] = useState<string | null>(null);
	const offeredDay = useRef<string | null>(null);
	const commitRef = useRef(commit);
	commitRef.current = commit;

	const { online, recheck, checking } = useOnlineStatus();
	// set when a refresh was skipped for lack of a network, so the reward is offered as soon as it returns
	const refreshPending = useRef(false);

	const refresh = useCallback(async () => {
		// Offline: do not wait for the auth refresh to time out (about 30 s); try again when the network is back.
		if (!(await isOnline())) {
			refreshPending.current = true;
			return;
		}
		refreshPending.current = false;
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

	useEffect(() => {
		if (online === true && refreshPending.current) void refresh();
	}, [online, refresh]);

	// The streak chip was tapped without a network: say so instead of showing nothing.
	if (open && !status && online === false && appState.current === MenuStateType.MENU) {
		return (
			<SimplePopupView style={[{ backgroundColor: opaqueColor(currentTheme.menuBackground) }]}>
				<Text style={[styles.screenTitle, { color: currentTheme.textPrimary }]}>{t("daily.title")}</Text>
				<OfflineNotice feature="daily" onRetry={recheck} checking={checking} />
				<StylizedButton text={t("daily.ok")} onClick={() => setOpen(false)} backgroundColor={currentTheme.buttonPrimary} />
			</SimplePopupView>
		);
	}

	if (!open || !status || appState.current !== MenuStateType.MENU) return null;

	const close = () => {
		setOpen(false);
		setClaim(null);
		setChestDone(false);
		setFailed(false);
		setOfferPush(false);
		setPushNote(null);
		setFreezeNote(null);
	};

	const onBuyFreeze = async () => {
		if (busy) return;
		setBusy(true);
		const result = await buyStreakFreeze();
		setBusy(false);
		if (!result) {
			setFreezeNote(t("daily.failed"));
			return;
		}
		if (result.status === "not_enough_coins") setFreezeNote(t("daily.freezeNoCoins"));
		else setFreezeNote(null);
		setStatus({ ...status!, freezes: result.freezes });
		if (result.status === "ok" && result.coins !== null) {
			const latest = await loadShopState();
			await commitRef.current({ ...latest, balance: result.coins }, []);
			track("streak_freeze_buy", { freezes: result.freezes });
		}
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
		setStatus({ ...status!, streak: won.streak, best: won.best, claimedToday: true, nextStreak: won.streak + 1, nextReward: won.nextReward, freezes: won.freezesLeft, freezesToUse: 0 });
		setChestDone(false);
		if (result.state === "claimed") {
			track("streak_claim", { streak: won.streak, reward: won.reward });
			if (won.freezesUsed > 0) celebrate({ id: `freeze:${Date.now()}`, icon: "diamond", accent: "#C084FC", title: t("celebrate.freezeTitle"), subtitle: t("celebrate.freezeSub", { days: won.freezesUsed }), lines: [t("daily.freezes", { have: won.freezesLeft, cap: status!.freezeCap })] });
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
	const daysToChest = (() => {
		const next = status.calendar.find((entry) => entry.chest && entry.day >= (claimedNow || alreadyClaimed ? shownStreak + 1 : status.nextStreak));
		return next ? next.day - (claimedNow || alreadyClaimed ? shownStreak : status.nextStreak - 1) : null;
	})();

	return (
		<SimplePopupView style={[{ backgroundColor: opaqueColor(currentTheme.menuBackground) }]}>
			<Text style={[styles.screenTitle, { color: currentTheme.textPrimary }]}>{t("daily.title")}</Text>
			{/* the streak like on Duolingo: the days in huge red numbers, a big flame beside them */}
			<View style={styles.hero}>
				<View style={styles.heroText}>
					<CountUp value={shownStreak} style={styles.heroNumber} />
					<Text style={styles.heroLabel}>{t("streak.days")}!</Text>
				</View>
				<StreakFlame size={72} dimmed={shownStreak === 0} />
			</View>
			<View style={[styles.freezeCard, { borderColor: "rgba(255,255,255,0.18)" }]}>
				<FreezeCrystal size={36} dimmed={status.freezes === 0} />
				<View style={styles.freezeText}>
					<Text style={[styles.freezeLine, { color: currentTheme.textPrimary }]}>{t("daily.freezeCard", { have: status.freezes, cap: status.freezeCap })}</Text>
					{!chest && status.freezes < status.freezeCap ? (
						<Pressable onPress={() => void onBuyFreeze()} accessibilityRole="button">
							<Text style={styles.freezeGet}>{t("daily.freezeGet", { price: status.freezePrice })}</Text>
						</Pressable>
					) : null}
					{!claimedNow && !alreadyClaimed && status.freezesToUse > 0 ? <Text style={[styles.note, { color: "#C084FC", textAlign: "left" }]}>{t("daily.freezeWillUse", { days: status.freezesToUse })}</Text> : null}
				</View>
			</View>
			{freezeNote ? <Text style={[styles.note, { color: "#FF6B6B", marginBottom: 6 }]}>{freezeNote}</Text> : null}
			<Text style={[styles.sectionTitle, { color: currentTheme.textPrimary }]}>{t("daily.calendar")}</Text>

			{chest ? (
				// the server already rolled the prize: the roulette stops on it, then the prize card shows
				<View style={styles.chestReveal}>
					<ChestRoulette prize={chest} onDone={() => setChestDone(true)} />
					{chestDone && <ChestPrizeCard prize={chest} />}
				</View>
			) : (
				<>
					<DailyCalendar calendar={status.calendar} collected={collected} today={today} weekdays={weekdays} />
					{!claimedNow && !alreadyClaimed && status.nextChest && (
						<View style={styles.chestOdds}>
							<Text style={[styles.oddsTitle, { color: currentTheme.textSecondary }]}>{t("chest.odds")}</Text>
							<ChestOdds size={status.nextChest} lucky={lucky} />
							<LuckyHourNote />
						</View>
					)}
				</>
			)}

			<View style={styles.block}>
				{claimedNow && claim.freezesUsed > 0 && <FadeInView pop><Text style={[styles.note, { color: "#C084FC" }]}>{t("daily.freezeUsed", { days: claim.freezesUsed })}</Text></FadeInView>}
				{claimedNow && claim.freezeGranted && <FadeInView pop><Text style={[styles.note, { color: "#C084FC" }]}>{t("daily.freezeGranted")}</Text></FadeInView>}
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
				{failed && <Text style={[styles.note, { color: "#FF6B6B" }]}>{online === false ? t("offline.body.daily") : t("daily.failed")}</Text>}
				{!chest ? <Text style={[styles.note, { color: currentTheme.textSecondary, fontSize: 9 }]}>{t("daily.rules")}</Text> : null}
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
				) : chest && !chestDone ? null : (
					<StylizedButton text={t("daily.ok")} onClick={close} backgroundColor={currentTheme.buttonPrimary} />
				)}
			</View>
		</SimplePopupView>
	);
}

const styles = StyleSheet.create({
	screenTitle: {
		fontFamily: "SilkscreenBold",
		fontSize: 16,
		textAlign: "center",
		marginBottom: 6,
	},
	hero: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		alignSelf: "stretch",
		paddingHorizontal: 8,
		marginBottom: 6,
	},
	heroText: {
		flex: 1,
	},
	heroNumber: {
		fontFamily: "SilkscreenBold",
		fontSize: 52,
		color: "#FB4B5B",
	},
	heroLabel: {
		fontFamily: "SilkscreenBold",
		fontSize: 16,
		color: "#FB4B5B",
	},
	freezeCard: {
		flexDirection: "row",
		alignItems: "center",
		gap: 14,
		alignSelf: "stretch",
		padding: 10,
		borderWidth: 2,
		borderBottomWidth: 4,
		borderRadius: 16,
		marginBottom: 12,
	},
	freezeText: {
		flex: 1,
		gap: 4,
	},
	freezeLine: {
		fontFamily: "SilkscreenBold",
		fontSize: 13,
	},
	freezeGet: {
		fontFamily: "SilkscreenBold",
		fontSize: 12,
		color: "#C084FC",
	},
	sectionTitle: {
		fontFamily: "SilkscreenBold",
		fontSize: 18,
		alignSelf: "flex-start",
		marginBottom: 8,
		paddingHorizontal: 4,
	},
	title: {
		fontFamily: "Silkscreen",
		fontSize: 24,
		textAlign: "center",
		marginBottom: 16,
	},
	block: {
		alignItems: "center",
		gap: 4,
		marginTop: 8,
		marginBottom: 8,
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
		alignSelf: "stretch",
		alignItems: "center",
		gap: 12,
		marginVertical: 8,
	},
	chestOdds: {
		alignSelf: "stretch",
		gap: 8,
		marginTop: 12,
	},
	oddsTitle: {
		fontFamily: "Silkscreen",
		fontSize: 12,
		textAlign: "center",
	},
	buttons: {
		gap: 8,
		alignItems: "center",
		marginTop: 8,
	},
});
