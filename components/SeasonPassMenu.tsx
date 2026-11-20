import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import PixelLoader from "@/components/PixelLoader";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import UiIcon from "./UiIcon";
import CosmeticPreview from "./CosmeticPreview";
import ChestRoulette from "./ChestRoulette";
import { ChestPrizeCard } from "./ChestParts";
import { PixelChest } from "./DailyCalendar";
import Collapsible from "./Collapsible";
import { formatSeasonKey } from "./SeasonTitleBadges";
import { cssColors } from "@/constants/Color";
import { opaqueColor, useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { MenuStateType, useSetAppState } from "@/hooks/useAppState";
import { useAccountIdentity } from "@/hooks/useAccountIdentity";
import { setProfileAuthIntent } from "@/constants/ProfileIntent";
import { getShopItem, loadShopState, useShopState } from "@/constants/Shop";
import { shopItemText } from "@/constants/i18n/shopItems";
import { useSoundSettings } from "@/constants/Sound";
import { track } from "@/constants/Analytics";
import {
	COSMETIC_FALLBACK_COINS,
	PREMIUM_COSMETIC_COINS,
	PREMIUM_REWARDS,
	claimSeasonPassPremiumTier,
	claimablePremiumTiers,
	unlockSeasonPassPremium,
	DAILY_XP_CAP,
	MINIMUM_PLAY,
	SOURCE_RULES,
	TIER_COUNT,
	TIER_REWARDS,
	claimSeasonPassTier,
	claimableTiers,
	cosmeticsForSeason,
	nextRewardTier,
	resolveReward,
	seasonTimeLeft,
	tierCost,
	tierProgress,
	useSeasonPass,
	type ResolvedReward,
	type TierClaim,
	type XpSource,
} from "@/constants/SeasonPass";

const GOLD = "#FFC93C";
const CYAN = "#38BDF8";
const GREEN = "#22C55E";
const RULE_ORDER: XpSource[] = ["classic", "chaos", "challenge", "level", "versus", "more_win", "more_play", "quest_task", "quest_bonus"];
const BAR_BLOCKS = 20;
const TILE_W = 64;
const TILE_STEP = TILE_W + 6;

/** The season pass: progress, the 30 tiers with their rewards and a claim button where one is waiting. */
export default function SeasonPassMenu() {
	const { t, language } = useLanguage();
	const { currentTheme } = useTheme();
	const { playSfx } = useSoundSettings();
	const [, appendAppState, popAppState] = useSetAppState();
	const { checked, signedIn } = useAccountIdentity();
	const { state: shop, commit } = useShopState();
	const { pass, refresh } = useSeasonPass();
	const [load, setLoad] = useState<"loading" | "ready" | "failed">("loading");
	const [now, setNow] = useState(() => new Date());
	// a tier being claimed: its number for the free track, minus its number for the premium one
	const [busy, setBusy] = useState<number | "all" | null>(null);
	const [unlocking, setUnlocking] = useState(false);
	const [poor, setPoor] = useState(false);
	const [failed, setFailed] = useState(false);
	const [howOpen, setHowOpen] = useState(false);
	const [reveal, setReveal] = useState<TierClaim[] | null>(null);
	// the tier whose reward the big card shows (null: the one that matters)
	const [selected, setSelected] = useState<number | null>(null);
	const railRef = useRef<ScrollView>(null);
	const railOpened = useRef(false);

	const handleBack = useCallback(() => popAppState(), [popAppState]);
	useEscapeKey(handleBack);

	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), 60_000);
		return () => clearInterval(timer);
	}, []);

	useEffect(() => {
		if (!checked) return;
		if (!signedIn) {
			setLoad("ready");
			return;
		}
		let cancelled = false;
		void refresh().then((state) => {
			if (!cancelled) setLoad(state ? "ready" : "failed");
		});
		return () => {
			cancelled = true;
		};
	}, [checked, signedIn, refresh]);

	const state = signedIn ? pass : null;
	const tier = state?.tier ?? 0;
	const waiting = claimableTiers(state);
	const premium = state?.premium ?? null;
	const premiumWaiting = claimablePremiumTiers(state);
	const premiumOpen = premium?.unlocked === true;
	const progress = tierProgress(state?.xp ?? 0);
	const left = seasonTimeLeft(state, now);
	const upNext = nextRewardTier(state);
	// the season's skins: the server's list when it has answered, else the device's own copy
	const seasonKey = state?.season ?? new Date().toISOString().slice(0, 7);
	const cosmetics = cosmeticsForSeason(seasonKey, state?.cosmetics);

	// the pass opens on the tier that matters: the first one waiting for a claim, else the next one to earn
	const focusTier = waiting[0] ?? upNext ?? TIER_COUNT;
	const shownTier = selected ?? focusTier;
	useEffect(() => {
		if (railOpened.current || load !== "ready" || !state) return;
		railOpened.current = true;
		railRef.current?.scrollTo({ x: Math.max(0, (focusTier - 1) * TILE_STEP - 110), animated: false });
	}, [focusTier, load, state]);

	/** The wallet, the items and the keys the server answers with become the player's own. */
	const apply = async (claim: TierClaim) => {
		if (claim.wallet === null && claim.ownedItemIds.length === 0) return;
		const latest = await loadShopState();
		await commit({
			...latest,
			balance: claim.wallet ?? latest.balance,
			ownedItemIds: Array.from(new Set([...latest.ownedItemIds, ...claim.ownedItemIds])),
		}, []);
	};

	const claimItems = async (items: { tier: number; premium: boolean }[]) => {
		if (busy !== null || items.length === 0) return;
		playSfx("menuClick");
		setBusy(items.length === 1 ? (items[0].premium ? -items[0].tier : items[0].tier) : "all");
		setFailed(false);
		const won: TierClaim[] = [];
		for (const item of items) {
			const next = item.tier;
			const result = item.premium ? await claimSeasonPassPremiumTier(next) : await claimSeasonPassTier(next);
			if (result.status !== "ok") {
				if (result.status === "failed" || result.status === "guest") setFailed(true);
				if (result.status !== "already") break;
				continue;
			}
			await apply(result.claim);
			won.push(result.claim);
			track("season_pass_claim", { tier: next, premium: item.premium, chest: result.claim.chest?.size ?? null, item: result.claim.itemId });
		}
		setBusy(null);
		if (won.length > 0) setReveal(won);
		else void refresh();
	};

	// the big preview shows the most notable reward of the chosen tier: a skin first, then a chest, keys, coins
	const heroFree = state ? resolveReward(TIER_REWARDS[shownTier - 1], cosmetics) : null;
	const heroPremium = state && premium?.available ? resolveReward(PREMIUM_REWARDS[shownTier - 1], premium.cosmetics, PREMIUM_COSMETIC_COINS) : null;

	const claimTiers = (tiers: number[]) => claimItems(tiers.map((tier) => ({ tier, premium: false })));

	/** Opens the premium track for coins; the balance the server answers with becomes the player's own. */
	const unlockPremium = async () => {
		if (busy !== null || unlocking) return;
		playSfx("menuClick");
		setUnlocking(true);
		setFailed(false);
		setPoor(false);
		const result = await unlockSeasonPassPremium();
		if (result.status === "ok" && result.wallet !== null) {
			const latest = await loadShopState();
			await commit({ ...latest, balance: result.wallet }, []);
			track("season_pass_premium", { price: premium?.price ?? 0 });
		} else if (result.status === "poor") setPoor(true);
		else if (result.status === "failed" || result.status === "guest") setFailed(true);
		setUnlocking(false);
		void refresh();
	};

	const openProfile = () => {
		setProfileAuthIntent("login");
		appendAppState(MenuStateType.PROFILE);
	};

	if (reveal) {
		return <ClaimReveal claims={reveal} onClose={() => { setReveal(null); void refresh(); }} />;
	}

	const timeText = left.days > 0 ? t("pass.timeLeft", { days: left.days, hours: left.hours }) : t("pass.timeLeftHours", { hours: left.hours });
	const dayFull = state ? state.todayXp >= state.dailyCap : false;

	return (
		<SimplePopupView
			hideScrollbar
			footer={state && premium && premium.available && !premium.unlocked ? (
				<View style={styles.premiumFooter}>
					<StylizedButton
						text={unlocking ? t("pass.claiming") : t("pass.premiumUnlock", { price: premium.price })}
						onClick={() => void unlockPremium()}
						backgroundColor={shop.balance >= premium.price ? "#EA580C" : "#7C3A12"}
						disabled={unlocking || busy !== null}
						style={styles.premiumButton}
						textStyle={styles.claimAllText}
					/>
					{poor && <Text style={styles.failText}>{t("pass.premiumPoor", { price: premium.price })}</Text>}
				</View>
			) : undefined}
			style={[{ justifyContent: "flex-start", backgroundColor: opaqueColor(currentTheme.menuBackground) }]}>
			<View style={styles.topBar}>
				<StylizedButton text={t("pass.back")} onClick={handleBack} backgroundColor={cssColors.spaceGray} style={styles.backButton} textStyle={styles.backText} />
			</View>

			<View style={styles.titleRow}>
				<UiIcon name="star" size={20} />
				<Text style={[styles.header, { color: currentTheme.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>{t("pass.title")}</Text>
			</View>
			<Text style={[styles.sub, { color: currentTheme.textSecondary }]}>
				{formatSeasonKey(seasonKey, t, true)} · {timeText}
			</Text>
			<Text style={[styles.hint, { color: currentTheme.textSecondary }]}>{t("pass.free")}</Text>

			{checked && !signedIn && (
				<Pressable onPress={openProfile} accessibilityRole="button" style={styles.guestCard}>
					<View style={{ flex: 1 }}>
						<Text style={styles.guestTitle}>{t("pass.guestTitle")}</Text>
						<Text style={styles.guestText}>{t("pass.guestText")}</Text>
					</View>
					<Text style={styles.guestButton}>{t("pass.guestButton")}</Text>
				</Pressable>
			)}

			{signedIn && load === "loading" && !state && <PixelLoader size="large" color={currentTheme.textPrimary} />}
			{signedIn && load === "failed" && !state && (
				<View style={styles.failBox}>
					<Text style={styles.failText}>{t("pass.failed")}</Text>
					<StylizedButton text={t("pass.retry")} onClick={() => { setLoad("loading"); void refresh().then((s) => setLoad(s ? "ready" : "failed")); }} backgroundColor={currentTheme.buttonPrimary} style={styles.smallButton} textStyle={styles.smallText} />
				</View>
			)}

			{state && (
				<View style={styles.panel}>
					<View style={styles.tierLine}>
						<Text style={styles.tierBig}>{t("pass.tierOf", { tier, total: TIER_COUNT })}</Text>
						<Text style={styles.xpTotal}>{state.xp} XP</Text>
					</View>
					<XpBar fraction={progress.fraction} color={upNext === null ? GOLD : CYAN} />
					<Text style={[styles.note, { color: currentTheme.textSecondary }]}>
						{upNext === null ? t("pass.complete") : t("pass.xpInto", { into: progress.into, needed: progress.needed, next: upNext })}
					</Text>
					<Text style={[styles.note, { color: dayFull ? GOLD : currentTheme.textSecondary }]}>
						{dayFull ? t("pass.todayFull") : t("pass.today", { xp: state.todayXp, cap: state.dailyCap })}
					</Text>
				</View>
			)}

			{heroFree && <HeroReward tier={shownTier} free={heroFree} premium={heroPremium} language={language} />}

			{waiting.length + premiumWaiting.length > 0 && (
				<StylizedButton
					text={busy === "all" ? t("pass.claiming") : t("pass.claimAll", { count: waiting.length + premiumWaiting.length })}
					onClick={() => void claimItems([...waiting.map((tier) => ({ tier, premium: false })), ...premiumWaiting.map((tier) => ({ tier, premium: true }))])}
					backgroundColor="#B8860B"
					disabled={busy !== null}
					style={styles.claimAll}
					textStyle={styles.claimAllText}
				/>
			)}
			{failed && <Text style={styles.failText}>{t("pass.failed")}</Text>}


			{/* the whole pass at a glance: one column per tier, the free reward on top of the premium one */}
			<ScrollView ref={railRef} horizontal showsHorizontalScrollIndicator={false} style={styles.rail} contentContainerStyle={styles.railContent}>
				{TIER_REWARDS.map((entry) => {
					const reward = resolveReward(entry, cosmetics);
					const claimed = state?.claimed.includes(reward.tier) ?? false;
					const ready = !claimed && reward.tier <= tier;
					const isNext = !claimed && !ready && reward.tier === upNext && state !== null;
					const premiumEntry = premium?.available ? resolveReward(PREMIUM_REWARDS[reward.tier - 1], premium.cosmetics, PREMIUM_COSMETIC_COINS) : null;
					const premiumClaimed = premium?.claimed.includes(reward.tier) ?? false;
					const premiumStatus: TileStatus = premiumClaimed ? "claimed" : premiumOpen && reward.tier <= tier ? "ready" : "locked";
					const select = () => { playSfx("menuClick"); setSelected(reward.tier); };
					return (
						<View key={reward.tier} style={styles.railColumn}>
							<TierTile
								reward={reward}
								status={claimed ? "claimed" : ready ? "ready" : isNext ? "next" : "locked"}
								selected={reward.tier === shownTier}
								onPress={select}
							/>
							{premiumEntry && (
								<TierTile reward={premiumEntry} premium locked={!premiumOpen} status={premiumStatus} selected={reward.tier === shownTier} onPress={select} />
							)}
						</View>
					);
				})}
			</ScrollView>

			{/* the chosen tier, big */}
			<View style={styles.track}>
				{(() => {
					const reward = resolveReward(TIER_REWARDS[shownTier - 1], cosmetics);
					const claimed = state?.claimed.includes(reward.tier) ?? false;
					const ready = !claimed && reward.tier <= tier;
					const isNext = !claimed && !ready && reward.tier === upNext && state !== null;
					return (
						<>
							<Text style={[styles.trackLabel, { color: currentTheme.textSecondary }]}>{t("pass.freeTag")}</Text>
							<TierRow
								reward={reward}
								claimed={claimed}
								ready={ready}
								isNext={isNext}
								busy={busy === reward.tier || busy === "all"}
								disabled={busy !== null || !signedIn}
								progress={isNext ? progress.fraction : 0}
								language={language}
								onClaim={() => void claimTiers([reward.tier])}
							/>
							{premium?.available ? (
								(() => {
									const prem = resolveReward(PREMIUM_REWARDS[reward.tier - 1], premium.cosmetics, PREMIUM_COSMETIC_COINS);
									const premClaimed = premium.claimed.includes(reward.tier);
									const premReady = premiumOpen && !premClaimed && reward.tier <= tier;
									return (
										<>
											<Text style={[styles.trackLabel, { color: "#FB923C" }]}>{t("pass.premiumTag")}</Text>
											<TierRow
												reward={prem}
												claimed={premClaimed}
												ready={premReady}
												isNext={false}
												busy={busy === -reward.tier || busy === "all"}
												disabled={busy !== null || !signedIn}
												progress={0}
												language={language}
												lockedText={premiumOpen ? undefined : t("pass.premiumNeed")}
												onClaim={() => void claimItems([{ tier: reward.tier, premium: true }])}
											/>
										</>
									);
								})()
							) : null}
						</>
					);
				})()}
			</View>
			{state && premium && premium.available && !premium.unlocked && (
				<View style={styles.premiumCard}>
					<Text style={styles.premiumTitle}>{t("pass.premiumTitle")}</Text>
					<Text style={[styles.premiumText, { color: currentTheme.textSecondary }]}>{t("pass.premiumText")}</Text>
					<View style={styles.premiumSkins}>
						{Object.values(premium.cosmetics).map((id) => {
							const item = getShopItem(id);
							return item ? <View key={id} style={styles.premiumSkin}><CosmeticPreview item={item} /></View> : null;
						})}
					</View>
				</View>
			)}
			{state && premium && !premium.available && <Text style={[styles.note, { color: currentTheme.textSecondary, marginTop: 8, paddingHorizontal: 12 }]}>{t("pass.premiumSoon")}</Text>}
			{state && premiumOpen && <Text style={[styles.note, { color: "#FB923C", marginTop: 8 }]}>{t("pass.premiumOpen")}</Text>}

			<Pressable onPress={() => setHowOpen((open) => !open)} accessibilityRole="button" style={styles.howHead}>
				<Text style={[styles.howTitle, { color: currentTheme.textPrimary }]}>{t("pass.how")}</Text>
				<Text style={[styles.howTitle, { color: currentTheme.textSecondary }]}>{howOpen ? "-" : "+"}</Text>
			</Pressable>
			<Collapsible visible={howOpen}>
				<View style={styles.howBody}>
					{RULE_ORDER.map((source) => (
						<View key={source} style={styles.ruleRow}>
							<Text style={[styles.ruleName, { color: currentTheme.textPrimary }]}>{t(`pass.rule.${source}`)}</Text>
							<Text style={[styles.ruleXp, { color: CYAN }]}>{t("pass.rule.line", { xp: SOURCE_RULES[source].xp, max: SOURCE_RULES[source].max })}</Text>
						</View>
					))}
					<Text style={[styles.note, { color: currentTheme.textSecondary, marginTop: 6 }]}>{t("pass.howNote", { cap: DAILY_XP_CAP })}</Text>
					<Text style={[styles.note, { color: currentTheme.textSecondary }]}>
						{t("pass.minNote", { classicScore: MINIMUM_PLAY.classic!.score!, classicSeconds: MINIMUM_PLAY.classic!.seconds, challengeScore: MINIMUM_PLAY.challenge!.score!, challengeSeconds: MINIMUM_PLAY.challenge!.seconds, moreSeconds: MINIMUM_PLAY.more_win!.seconds })}
					</Text>
				</View>
			</Collapsible>
			<Text style={[styles.endNote, { color: currentTheme.textSecondary }]}>{t("pass.endsNote")}</Text>
		</SimplePopupView>
	);
}

/** A bar of pixel blocks, filled from the left. */
function XpBar({ fraction, color }: { fraction: number; color: string }) {
	const filled = Math.round(fraction * BAR_BLOCKS);
	return (
		<View style={styles.bar}>
			{Array.from({ length: BAR_BLOCKS }, (_, i) => (
				<View key={i} style={[styles.barBlock, i < filled && { backgroundColor: color, borderColor: color }]} />
			))}
		</View>
	);
}

function RewardLine({ reward, language }: { reward: ResolvedReward; language: "en" | "ru" }) {
	const { t } = useLanguage();
	const { currentTheme } = useTheme();
	const item = reward.itemId ? getShopItem(reward.itemId) : undefined;
	const lines: React.ReactNode[] = [];
	if (item) {
		lines.push(
			<View key="item" style={styles.rewardRow}>
				<View style={styles.itemPreview}><CosmeticPreview item={item} /></View>
				<View style={{ flex: 1 }}>
					<Text style={[styles.rewardText, { color: GOLD }]} numberOfLines={1}>{shopItemText(item, language).title}</Text>
					<Text style={[styles.rewardSub, { color: currentTheme.textSecondary }]} numberOfLines={1}>{t("pass.exclusive")}</Text>
				</View>
			</View>,
		);
	}
	if (reward.chest) {
		lines.push(
			<View key="chest" style={styles.rewardRow}>
				<PixelChest size={26} kind={reward.chest} />
				<Text style={[styles.rewardText, { color: currentTheme.textPrimary }]}>{t(reward.chest === "big" ? "pass.reward.chestBig" : "pass.reward.chestSmall")}</Text>
			</View>,
		);
	}
	if (reward.keys > 0) {
		lines.push(
			<View key="keys" style={styles.rewardRow}>
				<UiIcon name="key" size={27} />
				<Text style={[styles.rewardText, { color: currentTheme.textPrimary }]}>{t("pass.reward.keys", { count: reward.keys })}</Text>
			</View>,
		);
	}
	if (reward.coins > 0) {
		lines.push(
			<View key="coins" style={styles.rewardRow}>
				<UiIcon name="coin" size={27} />
				<Text style={[styles.rewardText, { color: "#FFD700" }]}>{t("pass.reward.coins", { coins: reward.coins })}</Text>
			</View>,
		);
	}
	return <View style={{ flex: 1, gap: 4 }}>{lines}</View>;
}

function TierRow({ reward, claimed, ready, isNext, busy, disabled, progress, language, lockedText, onClaim }: {
	reward: ResolvedReward;
	claimed: boolean;
	ready: boolean;
	isNext: boolean;
	busy: boolean;
	disabled: boolean;
	progress: number;
	language: "en" | "ru";
	/** Shown instead of "Locked" (the premium track not opened). */
	lockedText?: string;
	onClaim: () => void;
}) {
	const { t } = useLanguage();
	const { currentTheme } = useTheme();
	const border = ready ? GOLD : isNext ? CYAN : claimed ? "rgba(34,197,94,0.45)" : "rgba(255,255,255,0.14)";
	const milestone = reward.itemId !== null || reward.chest === "big";
	return (
		<View style={styles.rowWrap}>
			<View style={[styles.badge, { borderColor: border }, ready && styles.badgeReady, claimed && styles.badgeClaimed]}>
				<Text style={[styles.badgeText, { color: claimed ? GREEN : ready ? GOLD : currentTheme.textPrimary }]}>{reward.tier}</Text>
			</View>
			<View style={[styles.row, { borderColor: border, backgroundColor: ready ? "rgba(255,201,60,0.1)" : milestone ? "rgba(167,139,250,0.08)" : "rgba(255,255,255,0.04)" }, !ready && !claimed && !isNext && styles.rowLocked]}>
				<RewardLine reward={reward} language={language} />
				<View style={styles.status}>
					{claimed ? (
						<Text style={[styles.statusText, { color: GREEN }]}>{t("pass.claimed")}</Text>
					) : ready ? (
						<StylizedButton text={busy ? t("pass.claiming") : t("pass.claim")} onClick={onClaim} backgroundColor="#B8860B" disabled={disabled} style={styles.claimButton} textStyle={styles.claimText} />
					) : isNext ? (
						<View style={{ alignItems: "flex-end", gap: 4 }}>
							<Text style={[styles.statusText, { color: CYAN }]}>{t("pass.upNext")}</Text>
							<View style={styles.miniBar}><View style={[styles.miniFill, { width: `${Math.round(progress * 100)}%` }]} /></View>
							<Text style={[styles.rewardSub, { color: currentTheme.textSecondary }]}>{tierCost(reward.tier)} XP</Text>
						</View>
					) : (
						<Text style={[styles.statusText, { color: currentTheme.textSecondary }]}>{lockedText ?? t("pass.locked")}</Text>
					)}
				</View>
			</View>
		</View>
	);
}

/** The chosen tier's best reward at full size, with the track it belongs to. */
function HeroReward({ tier, free, premium, language }: { tier: number; free: ResolvedReward; premium: ResolvedReward | null; language: "en" | "ru" }) {
	const { t } = useLanguage();
	const { currentTheme } = useTheme();
	const candidates: { reward: ResolvedReward; premium: boolean }[] = [];
	if (premium) candidates.push({ reward: premium, premium: true });
	candidates.push({ reward: free, premium: false });
	const best =
		candidates.find((c) => c.reward.itemId) ??
		candidates.find((c) => c.reward.chest) ??
		candidates.find((c) => c.reward.keys > 0) ??
		candidates[0];
	const { reward } = best;
	const item = reward.itemId ? getShopItem(reward.itemId) : undefined;
	const accent = best.premium ? "#FB923C" : GOLD;
	const title = item
		? shopItemText(item, language).title
		: reward.chest
			? t(reward.chest === "big" ? "pass.reward.chestBig" : "pass.reward.chestSmall")
			: reward.keys > 0
				? t("pass.reward.keys", { count: reward.keys })
				: t("pass.reward.coins", { coins: reward.coins });
	return (
		<View style={[styles.hero, { borderColor: accent }]}>
			<View style={styles.heroHead}>
				<Text style={[styles.heroTier, { color: currentTheme.textPrimary }]}>{t("pass.tierTitle", { tier })}</Text>
				<View style={[styles.heroTag, { backgroundColor: accent }]}>
					<Text style={styles.heroTagText}>{best.premium ? t("pass.premiumTag") : t("pass.freeTag")}</Text>
				</View>
			</View>
			<View style={styles.heroVisual}>
				{item ? (
					<View style={{ width: "100%" }}><CosmeticPreview item={item} large /></View>
				) : reward.chest ? (
					<PixelChest size={56} kind={reward.chest} />
				) : reward.keys > 0 ? (
					<UiIcon name="key" size={56} />
				) : (
					<UiIcon name="coin" size={56} />
				)}
			</View>
			<Text style={[styles.heroTitle, { color: accent }]} numberOfLines={2}>{title}</Text>
			{item ? <Text style={[styles.rewardSub, { color: currentTheme.textSecondary }]}>{t("pass.exclusive")}</Text> : null}
		</View>
	);
}

type TileStatus = "claimed" | "ready" | "next" | "locked";

/** One tier of the rail: a FREE tag, the reward and the tier number underneath, coloured by where the player stands. */
function TierTile({ reward, status, selected, onPress, premium = false, locked = false }: { reward: ResolvedReward; status: TileStatus; selected: boolean; onPress: () => void; premium?: boolean; locked?: boolean }) {
	const { t } = useLanguage();
	const item = reward.itemId ? getShopItem(reward.itemId) : undefined;
	const color = status === "ready" ? GOLD : status === "next" ? CYAN : status === "claimed" ? GREEN : premium ? "rgba(251,146,60,0.45)" : "rgba(255,255,255,0.28)";
	const amount = reward.coins > 0 ? `+${reward.coins}` : reward.keys > 0 ? `x${reward.keys}` : "";
	return (
		<Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={t("pass.tierTitle", { tier: reward.tier })} style={styles.tileWrap}>
			<View style={[styles.tileTag, premium && styles.tileTagPremium]}>
				<Text style={[styles.tileTagText, premium && { color: "#FFFFFF" }]} numberOfLines={1} adjustsFontSizeToFit>{premium ? t("pass.premiumTag") : t("pass.freeTag")}</Text>
			</View>
			<View
				style={[
					styles.tile,
					{ borderColor: selected ? "#FFFFFF" : color },
					status === "locked" && { opacity: 0.72 },
					status === "claimed" && { backgroundColor: "rgba(34,197,94,0.12)" },
					status === "ready" && { backgroundColor: "rgba(255,201,60,0.14)", boxShadow: `0 0 10px ${GOLD}` },
				]}
			>
				{item ? (
					<View style={styles.tilePreview}><CosmeticPreview item={item} /></View>
				) : reward.chest ? (
					<PixelChest size={34} kind={reward.chest} />
				) : reward.keys > 0 ? (
					<UiIcon name="key" size={34} />
				) : (
					<UiIcon name="coin" size={34} />
				)}
				{amount ? <Text style={[styles.tileAmount, { color: reward.coins > 0 ? "#FFD700" : "#FFFFFF" }]}>{amount}</Text> : null}
				{locked ? <View style={styles.tileLock} pointerEvents="none"><UiIcon name="lock" size={18} /></View> : null}
			</View>
			<View style={[styles.tileNum, { backgroundColor: status === "locked" ? "rgba(255,255,255,0.1)" : color }]}>
				<Text style={[styles.tileNumText, { color: status === "locked" ? "#D4D4D8" : "#0B0B12" }]}>{reward.tier}</Text>
			</View>
		</Pressable>
	);
}

/** What the claims gave: each chest spins its roulette in turn, then one summary of the rest. */
function ClaimReveal({ claims, onClose }: { claims: TierClaim[]; onClose: () => void }) {
	const { t, language } = useLanguage();
	const { currentTheme } = useTheme();
	const chests = claims.filter((claim) => claim.chest !== null);
	const [index, setIndex] = useState(0);
	const [stopped, setStopped] = useState(false);
	const showingChest = index < chests.length;
	const current = showingChest ? chests[index] : null;

	const coins = claims.reduce((sum, claim) => sum + claim.coins, 0);
	const keys = claims.reduce((sum, claim) => sum + claim.keys, 0);
	const items = claims.filter((claim) => claim.itemId && !claim.duplicate).map((claim) => getShopItem(claim.itemId!)).filter((item) => item !== undefined);
	const duplicates = claims.filter((claim) => claim.itemId && claim.duplicate);

	return (
		<SimplePopupView style={[{ backgroundColor: opaqueColor(currentTheme.menuBackground) }]}>
			<Text style={[styles.header, { color: currentTheme.buttonPrimary, marginBottom: 14 }]}>{t("pass.collected")}</Text>
			{current?.chest ? (
				<View style={styles.revealBox}>
					<Text style={[styles.note, { color: currentTheme.textSecondary }]}>{t("pass.chestOf", { tier: current.tier })}</Text>
					<ChestRoulette key={current.tier} prize={current.chest} onDone={() => setStopped(true)} />
					{stopped && <ChestPrizeCard prize={current.chest} />}
					{stopped && (
						<StylizedButton text={t("pass.next")} onClick={() => { setStopped(false); setIndex((i) => i + 1); }} backgroundColor={currentTheme.buttonPrimary} />
					)}
				</View>
			) : (
				<View style={styles.revealBox}>
					{coins > 0 && (
						<View style={styles.rewardRow}><UiIcon name="coin" size={36} /><Text style={[styles.sumText, { color: "#FFD700" }]}>{t("pass.claimedCoins", { coins })}</Text></View>
					)}
					{keys > 0 && (
						<View style={styles.rewardRow}><UiIcon name="key" size={36} /><Text style={[styles.sumText, { color: currentTheme.textPrimary }]}>{t("pass.claimedKeys", { count: keys })}</Text></View>
					)}
					{items.map((item) => item && (
						<View key={item.id} style={styles.itemBox}>
							<Text style={styles.exclusive}>{t("pass.exclusive")}</Text>
							<View style={{ marginVertical: 6 }}><CosmeticPreview item={item} large /></View>
							<Text style={[styles.sumText, { color: GOLD }]}>{shopItemText(item, language).title}</Text>
						</View>
					))}
					{duplicates.map((claim) => (
						<Text key={claim.tier} style={[styles.note, { color: currentTheme.textSecondary }]}>
							{t("pass.duplicate", { name: shopItemText(getShopItem(claim.itemId!)!, language).title, coins: COSMETIC_FALLBACK_COINS[claim.tier] ?? 0 })}
						</Text>
					))}
					<StylizedButton text={t("pass.done")} onClick={onClose} backgroundColor={currentTheme.buttonPrimary} />
				</View>
			)}
		</SimplePopupView>
	);
}

const styles = StyleSheet.create({
	topBar: { width: "100%", flexDirection: "row", alignItems: "center" },
	backButton: { width: 88, minWidth: 88, height: 40, minHeight: 40, margin: 0, paddingHorizontal: 8 },
	backText: { fontSize: 12 },
	titleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, maxWidth: "92%" },
	header: { fontFamily: "Silkscreen", fontSize: 22, textAlign: "center" },
	sub: { fontFamily: "Silkscreen", fontSize: 13, textAlign: "center", marginTop: 6 },
	hint: { fontFamily: "Silkscreen", fontSize: 10, textAlign: "center", marginTop: 3, marginBottom: 10 },
	guestCard: { width: "94%", flexDirection: "row", alignItems: "center", gap: 10, padding: 12, marginBottom: 10, borderRadius: 10, borderWidth: 2, borderColor: GOLD, backgroundColor: "rgba(255,201,60,0.1)" },
	guestTitle: { fontFamily: "Silkscreen", fontSize: 14, color: GOLD },
	guestText: { fontFamily: "Silkscreen", fontSize: 10, lineHeight: 15, color: "#D4D4D8", marginTop: 4 },
	guestButton: { fontFamily: "Silkscreen", fontSize: 13, color: "#141414", backgroundColor: GOLD, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6, overflow: "hidden" },
	failBox: { alignItems: "center", gap: 8, marginVertical: 10 },
	failText: { fontFamily: "Silkscreen", fontSize: 11, color: "#FF6B6B", textAlign: "center", marginVertical: 4 },
	smallButton: { minWidth: 0, height: 36, margin: 0, paddingHorizontal: 16, borderRadius: 8 },
	smallText: { fontSize: 12 },
	panel: { width: "94%", padding: 10, gap: 5, borderRadius: 10, borderWidth: 2, borderColor: "rgba(255,255,255,0.18)", backgroundColor: "rgba(255,255,255,0.05)" },
	tierLine: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
	tierBig: { fontFamily: "Silkscreen", fontSize: 15, color: "#FFFFFF" },
	xpTotal: { fontFamily: "Silkscreen", fontSize: 13, color: CYAN },
	note: { fontFamily: "Silkscreen", fontSize: 10, lineHeight: 15, textAlign: "center" },
	bar: { flexDirection: "row", gap: 2, padding: 3, borderWidth: 2, borderColor: "rgba(255,255,255,0.35)", backgroundColor: "rgba(0,0,0,0.35)" },
	barBlock: { flex: 1, height: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.05)" },
	claimAll: { alignSelf: "stretch", marginHorizontal: "3%", height: 46, marginTop: 12, marginBottom: 2, borderRadius: 8 },
	claimAllText: { fontSize: 15 },
	howHead: { width: "94%", flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, marginTop: 6 },
	howTitle: { fontFamily: "Silkscreen", fontSize: 12 },
	howBody: { width: "100%", paddingHorizontal: 8, gap: 5, paddingBottom: 8 },
	ruleRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
	ruleName: { flex: 1, fontFamily: "Silkscreen", fontSize: 10 },
	ruleXp: { fontFamily: "Silkscreen", fontSize: 10 },
	track: { width: "94%", gap: 6, marginTop: 6 },
	rail: { width: "100%", flexGrow: 0, marginTop: 6 },
	railColumn: { width: TILE_W, gap: 6 },
	hero: { width: "94%", marginTop: 10, padding: 12, gap: 8, borderRadius: 12, borderWidth: 2, backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center" },
	heroHead: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
	heroTier: { fontFamily: "SilkscreenBold", fontSize: 14 },
	heroTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
	heroTagText: { fontFamily: "SilkscreenBold", fontSize: 10, color: "#101014" },
	heroVisual: { width: "100%", minHeight: 72, alignItems: "center", justifyContent: "center" },
	heroTitle: { fontFamily: "SilkscreenBold", fontSize: 15, textAlign: "center" },
	premiumFooter: { width: "100%", alignItems: "center", gap: 4 },
	tileTagPremium: { backgroundColor: "#EA580C" },
	tileLock: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.45)" },
	trackLabel: { fontFamily: "SilkscreenBold", fontSize: 10, marginTop: 6 },
	premiumCard: { width: "94%", marginTop: 10, padding: 12, gap: 8, borderRadius: 12, borderWidth: 2, borderColor: "#EA580C", backgroundColor: "rgba(234,88,12,0.10)", alignItems: "center" },
	premiumTitle: { fontFamily: "SilkscreenBold", fontSize: 16, color: "#FB923C" },
	premiumText: { fontFamily: "Silkscreen", fontSize: 10, lineHeight: 15, textAlign: "center" },
	premiumSkins: { flexDirection: "row", gap: 6, width: "100%" },
	premiumSkin: { flex: 1 },
	premiumButton: { alignSelf: "stretch", height: 44, margin: 0, borderRadius: 8 },
	railContent: { paddingHorizontal: 8, paddingVertical: 4, gap: 6 },
	tileWrap: { width: TILE_W, alignItems: "stretch" },
	tileTag: { height: 16, backgroundColor: "#F4F5F7", alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
	tileTagText: { fontFamily: "SilkscreenBold", fontSize: 8, color: "#101014" },
	tile: { height: 74, borderWidth: 2, borderTopWidth: 0, alignItems: "center", justifyContent: "center", gap: 2, backgroundColor: "rgba(0,0,0,0.45)", overflow: "hidden" },
	tilePreview: { width: "100%", paddingHorizontal: 2 },
	tileAmount: { fontFamily: "SilkscreenBold", fontSize: 10 },
	tileNum: { height: 18, alignItems: "center", justifyContent: "center" },
	tileNumText: { fontFamily: "SilkscreenBold", fontSize: 11 },
	rowWrap: { flexDirection: "row", alignItems: "stretch", gap: 8 },
	badge: { width: 38, alignItems: "center", justifyContent: "center", borderWidth: 2, backgroundColor: "rgba(0,0,0,0.35)" },
	badgeReady: { backgroundColor: "rgba(255,201,60,0.18)" },
	badgeClaimed: { backgroundColor: "rgba(34,197,94,0.12)" },
	badgeText: { fontFamily: "SilkscreenBold", fontSize: 14 },
	row: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 10, minHeight: 52, borderWidth: 2 },
	rowLocked: { opacity: 0.62 },
	rewardRow: { flexDirection: "row", alignItems: "center", gap: 8 },
	rewardText: { fontFamily: "Silkscreen", fontSize: 12 },
	rewardSub: { fontFamily: "Silkscreen", fontSize: 9 },
	itemPreview: { width: 64, height: 48, alignItems: "center", justifyContent: "center" },
	status: { minWidth: 76, alignItems: "flex-end", justifyContent: "center" },
	statusText: { fontFamily: "Silkscreen", fontSize: 10, textAlign: "right" },
	claimButton: { minWidth: 0, height: 34, margin: 0, paddingHorizontal: 12, borderRadius: 7 },
	claimText: { fontSize: 12 },
	miniBar: { width: 62, height: 6, backgroundColor: "rgba(255,255,255,0.12)" },
	miniFill: { height: 6, backgroundColor: CYAN },
	endNote: { fontFamily: "Silkscreen", fontSize: 10, lineHeight: 15, textAlign: "center", marginTop: 12, marginBottom: 16, paddingHorizontal: 12 },
	revealBox: { alignSelf: "stretch", alignItems: "center", gap: 12 },
	sumText: { fontFamily: "Silkscreen", fontSize: 18 },
	itemBox: { alignItems: "center", padding: 12, borderWidth: 2, borderColor: GOLD, backgroundColor: "rgba(255,201,60,0.08)" },
	exclusive: { fontFamily: "Silkscreen", fontSize: 11, color: GOLD },
});
