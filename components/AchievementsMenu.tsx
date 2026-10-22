import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AnimatedNumber from "./AnimatedNumber";
import FadeInView from "./FadeInView";
import { AppState, StyleSheet, Text, View, useWindowDimensions, Pressable } from "react-native";
import PixelLoader from "@/components/PixelLoader";
import SimplePopupView from "./SimplePopupView";
import AchievementIcon from "./AchievementIcon";
import SegmentedControl from "./SegmentedControl";
import StylizedButton from "./StylizedButton";
import UiIcon from "./UiIcon";
import { useTheme } from "@/constants/Theme";
import { cssColors } from "@/constants/Color";
import {
	ACHIEVEMENT_CHAIN_GROUPS,
	AchievementGroup,
	AchievementRow,
	getAchievementRows,
	subscribeToAchievementProgress,
	subscribeToAchievementUnlocks,
} from "@/constants/Achievements";
import {
	AchievementChainView,
	buildChainViews,
	claimAchievements,
	readClaimedAchievements,
} from "@/constants/AchievementRewards";
import { useAppState } from "@/hooks/useAppState";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useAccountIdentity } from "@/hooks/useAccountIdentity";
import { loadShopState, useShopState } from "@/constants/Shop";
import { useLanguage } from "@/constants/Localization";

const GROUPS: AchievementGroup[] = ["solo", "versus", "games", "economy"];

export default function AchievementsMenu() {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const [, , , popAppState] = useAppState();
	const { width } = useWindowDimensions();
	const isMobile = width < 600;
	const { signedIn } = useAccountIdentity();
	const [achievements, setAchievements] = useState<AchievementRow[]>([]);
	const [claimed, setClaimed] = useState<string[]>([]);
	const [loading, setLoading] = useState(true);
	const [group, setGroup] = useState<AchievementGroup>("solo");
	const [claiming, setClaiming] = useState(false);
	const [claimNote, setClaimNote] = useState<{ text: string; ok: boolean } | null>(null);

	const chains = useMemo(() => buildChainViews(achievements, claimed), [achievements, claimed]);
	const completedCount = useMemo(() => achievements.filter((achievement) => achievement.progress.complete).length, [achievements]);
	const pendingCoins = useMemo(() => chains.reduce((sum, chain) => sum + chain.claimableCoins, 0), [chains]);
	const pendingIds = useMemo(() => chains.flatMap((chain) => chain.claimable.map((tier) => tier.id)), [chains]);

	// Per tab: rewards waiting first, then the chains closest to their next tier, then not started, finished ones last.
	const visibleChains = useMemo(() => {
		const inGroup = chains.filter((chain) => ACHIEVEMENT_CHAIN_GROUPS[chain.chain] === group);
		const rank = (chain: AchievementChainView) => (chain.claimable.length > 0 ? 0 : chain.allDone ? 3 : chain.focus.progress.current > 0 ? 1 : 2);
		const ratio = (chain: AchievementChainView) => chain.focus.progress.current / Math.max(1, chain.focus.target);
		return [...inGroup].sort((a, b) => rank(a) - rank(b) || (rank(a) === 1 ? ratio(b) - ratio(a) : 0));
	}, [chains, group]);

	const waitingByGroup = useMemo(() => {
		const counts: Record<AchievementGroup, number> = { solo: 0, versus: 0, games: 0, economy: 0 };
		for (const chain of chains) if (chain.claimable.length > 0) counts[ACHIEVEMENT_CHAIN_GROUPS[chain.chain]] += 1;
		return counts;
	}, [chains]);

	// Secret states
	const [firstStepsClicks, setFirstStepsClicks] = useState(0);
	const [secretMessage, setSecretMessage] = useState<string | null>(null);
	const { state: shopState, commit: commitShopState } = useShopState();

	const handleChainPress = async (chain: AchievementChainView) => {
		if (chain.chain !== "solo_games") return;
		if (shopState.ownedItemIds.includes("sfx_custom")) return;

		const newClicks = firstStepsClicks + 1;
		setFirstStepsClicks(newClicks);

		if (newClicks === 7) {
			setSecretMessage("SECRET UNLOCKED: Custom SFX URL in Shop!");
			const newState = {
				...shopState,
				ownedItemIds: [...shopState.ownedItemIds, "sfx_custom"],
			};
			await commitShopState(newState);
		} else if (newClicks >= 3) {
			setSecretMessage(`${7 - newClicks} clicks remaining...`);
		}
	};

	const isMountedRef = useRef(true);
	const hasLoadedRef = useRef(false);

	// `silent` refreshes keep the current list on screen instead of showing the spinner.
	const loadAchievements = useCallback(async (silent = false) => {
		if (!silent || !hasLoadedRef.current) setLoading(true);
		const [rows, storedClaims] = await Promise.all([getAchievementRows(), readClaimedAchievements()]);
		if (!isMountedRef.current) return;
		hasLoadedRef.current = true;
		setAchievements(rows);
		setClaimed(storedClaims);
		setLoading(false);
		// The server knows which tiers were paid (also on other devices).
		const fromServer = await claimAchievements([]);
		if (fromServer && isMountedRef.current) setClaimed(fromServer.claimed);
	}, []);

	useEffect(() => {
		isMountedRef.current = true;
		void loadAchievements();

		// Refresh by itself when progress changes, an achievement unlocks, or the app comes back to the foreground.
		const refresh = () => void loadAchievements(true);
		const unsubscribeProgress = subscribeToAchievementProgress(refresh);
		const unsubscribeUnlocks = subscribeToAchievementUnlocks(refresh);
		const appStateSubscription = AppState.addEventListener("change", (state) => {
			if (state === "active") refresh();
		});

		return () => {
			isMountedRef.current = false;
			unsubscribeProgress();
			unsubscribeUnlocks();
			appStateSubscription.remove();
		};
	}, [loadAchievements]);

	const claim = async (ids: string[]) => {
		if (claiming || ids.length === 0) return;
		setClaiming(true);
		setClaimNote(null);
		const result = await claimAchievements(ids);
		setClaiming(false);
		if (!isMountedRef.current) return;
		if (!result) {
			setClaimNote({ text: t("ach.claimFailed"), ok: false });
			return;
		}
		setClaimed(result.claimed);
		if (result.coins !== null) {
			const latest = await loadShopState();
			await commitShopState({ ...latest, balance: result.coins }, []);
		}
		const paid = result.granted.reduce((sum, id) => sum + (achievements.find((row) => row.id === id)?.reward ?? 0), 0);
		setClaimNote({ text: t("ach.claimed", { coins: paid }), ok: true });
	};

	useEscapeKey(popAppState);

	const tabLabel = (key: AchievementGroup) => `${t(`ach.tab.${key}`)}${waitingByGroup[key] > 0 ? " •" : ""}`;

	return (
		<SimplePopupView style={[
			{ backgroundColor: currentTheme.menuBackground, height: "80%" },
			isMobile && { width: "92%", height: "88%", paddingHorizontal: 8 },
		]}>
			<View style={styles.topBar}>
				<StylizedButton
					text={t("ach.back")}
					onClick={popAppState}
					backgroundColor={cssColors.spaceGray}
					style={styles.backButton}
					textStyle={styles.buttonText}
				/>
				<Text style={[styles.header, { color: currentTheme.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{t("ach.header")}</Text>
				<Pressable
					onPress={() => void loadAchievements()}
					accessibilityLabel={t("ach.refresh")}
					style={styles.refreshIcon}
				>
					<UiIcon name="refresh" size={18} />
				</Pressable>
			</View>
			{!loading && (
				<View style={[styles.summaryCard, { borderColor: currentTheme.accent }]}>
					<UiIcon name="medalGold" size={36} />
					<View style={styles.summaryText}>
						<View style={styles.summaryCountRow}>
							<AnimatedNumber value={completedCount} style={[styles.summaryCount, { color: currentTheme.accent }]} />
							<Text style={[styles.summaryCount, { color: currentTheme.accent }]}> / {achievements.length}</Text>
						</View>
						<View style={styles.progressTrack}>
							<View
								style={[
									styles.progressFill,
									{
										width: `${achievements.length ? Math.round((completedCount / achievements.length) * 100) : 0}%` as `${number}%`,
										backgroundColor: currentTheme.accent,
									},
								]}
							/>
						</View>
					</View>
					{pendingCoins > 0 && signedIn && (
						<StylizedButton
							text={t("ach.claimAll", { coins: pendingCoins })}
							onClick={() => void claim(pendingIds)}
							backgroundColor="#16A34A"
							disabled={claiming}
							style={styles.claimAllButton}
							textStyle={styles.claimText}
						/>
					)}
				</View>
			)}
			{!loading && pendingCoins > 0 && !signedIn && (
				<Text style={[styles.note, { color: currentTheme.accent }]}>{t("ach.signInToClaim", { coins: pendingCoins })}</Text>
			)}
			{claimNote && (
				<Text style={[styles.note, { color: claimNote.ok ? "#4ADE80" : "#F87171" }]}>{claimNote.text}</Text>
			)}
			{secretMessage && (
				<Text style={{ fontFamily: 'Silkscreen', fontSize: 12, color: '#FFD700', marginBottom: 10, textAlign: 'center' }}>
					{secretMessage}
				</Text>
			)}
			<View style={styles.tabs}>
				<SegmentedControl<AchievementGroup>
					small
					value={group}
					onChange={setGroup}
					items={GROUPS.map((key) => ({ key, label: tabLabel(key) }))}
				/>
			</View>

			{loading ? (
				<PixelLoader size="large" color={currentTheme.accent} style={styles.loader} />
			) : (
				<View style={styles.list}>
					{visibleChains.map((chain, chainIndex) => (
						<FadeInView key={`${group}-${chain.chain}`} index={chainIndex}>
							<ChainCard
								chain={chain}
								signedIn={signedIn}
								claiming={claiming}
								onPress={() => void handleChainPress(chain)}
								onClaim={() => void claim(chain.claimable.map((tier) => tier.id))}
							/>
						</FadeInView>
					))}
				</View>
			)}

		</SimplePopupView>
	);
}

function ChainCard({
	chain,
	signedIn,
	claiming,
	onPress,
	onClaim,
}: {
	chain: AchievementChainView;
	signedIn: boolean;
	claiming: boolean;
	onPress: () => void;
	onClaim: () => void;
}) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const { focus } = chain;
	const done = chain.allDone;
	const ready = chain.claimable.length > 0;
	const progressPercent = Math.min(100, Math.round((focus.progress.current / focus.progress.target) * 100));
	const borderColor = ready ? "#4ADE80" : done ? currentTheme.accent : "rgba(255, 255, 255, 0.16)";

	return (
		<Pressable
			onPress={onPress}
			style={[
				styles.row,
				{
					borderColor,
					backgroundColor: ready ? "rgba(74, 222, 128, 0.08)" : done ? "rgba(240, 175, 12, 0.10)" : "rgba(255, 255, 255, 0.04)",
				},
			]}
		>
			<View
				style={[
					styles.medalBadge,
					{
						borderColor: done || ready ? currentTheme.accent : "rgba(255, 255, 255, 0.2)",
						backgroundColor: done ? "rgba(240, 175, 12, 0.16)" : "rgba(0, 0, 0, 0.35)",
					},
				]}
			>
				<AchievementIcon achievementId={focus.id} size={27} dimmed={!focus.progress.complete} />
			</View>
			<View style={styles.titleBlock}>
				<View style={styles.titleLine}>
					<Text style={[styles.chainTitle, { color: currentTheme.textSecondary }]} numberOfLines={1}>
						{t(`achc.${chain.chain}`)}
					</Text>
					<Text style={[styles.progress, { color: done ? currentTheme.accent : currentTheme.textSecondary }]}>
						{done ? "✓" : `${focus.progress.current}/${focus.progress.target}`}
					</Text>
				</View>
				<Text style={[styles.title, { color: currentTheme.textPrimary }]} numberOfLines={2}>
					{t(`ach.${focus.id}.title`)}
				</Text>
				<Text style={[styles.howTo, { color: currentTheme.textSecondary }]} numberOfLines={2}>
					{t(`ach.${focus.id}.unlock`)}
				</Text>
				{!done && (
					<View style={styles.progressTrack}>
						<View style={[styles.progressFill, { width: `${progressPercent}%` as `${number}%`, backgroundColor: currentTheme.buttonPrimary }]} />
					</View>
				)}
				<View style={styles.pipRow}>
					{chain.tiers.map((tier) => (
						<View
							key={tier.id}
							style={[
								styles.pip,
								tier.progress.complete
									? { backgroundColor: currentTheme.accent, borderColor: currentTheme.accent }
									: { borderColor: "rgba(255, 255, 255, 0.3)" },
							]}
						/>
					))}
					<Text style={[styles.pipText, { color: currentTheme.textSecondary }]}>
						{t("ach.tier", { n: chain.completedTiers, total: chain.tiers.length })}
					</Text>
				</View>
			</View>
			{ready ? (
				<StylizedButton
					text={`+${chain.claimableCoins}`}
					onClick={signedIn ? onClaim : undefined}
					backgroundColor={signedIn ? "#16A34A" : "#555"}
					disabled={claiming || !signedIn}
					style={styles.claimButton}
					textStyle={styles.claimText}
				/>
			) : done ? null : (
				<View style={styles.rewardChip}>
					<UiIcon name="coin" size={14} />
					<Text style={[styles.rewardText, { color: currentTheme.accent }]}>+{focus.reward}</Text>
				</View>
			)}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	topBar: {
		width: "100%",
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
		marginBottom: 10,
	},
	backButton: {
		width: 80,
		minWidth: 80,
	},
	buttonText: {
		fontSize: 12,
	},
	refreshIcon: {
		width: 44,
		height: 44,
		borderRadius: 10,
		borderWidth: 2,
		borderColor: "rgba(255, 255, 255, 0.25)",
		alignItems: "center",
		justifyContent: "center",
	},
	header: {
		flex: 1,
		minWidth: 0,
		fontFamily: "Silkscreen",
		fontSize: 16,
		textAlign: "center",
	},
	summaryCard: {
		width: "100%",
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		padding: 12,
		borderWidth: 1.5,
		borderRadius: 12,
		marginBottom: 8,
		backgroundColor: "rgba(240, 175, 12, 0.08)",
	},
	summaryText: {
		flex: 1,
		gap: 8,
	},
	summaryCountRow: {
		flexDirection: "row",
		alignItems: "center",
	},
	summaryCount: {
		fontFamily: "SilkscreenBold",
		fontSize: 20,
	},
	claimAllButton: {
		minWidth: 0,
		minHeight: 34,
		margin: 0,
		paddingHorizontal: 8,
	},
	claimButton: {
		minWidth: 0,
		minHeight: 34,
		margin: 0,
		paddingHorizontal: 8,
	},
	claimText: {
		fontSize: 10,
	},
	note: {
		fontFamily: "Silkscreen",
		fontSize: 10,
		textAlign: "center",
		marginBottom: 8,
	},
	tabs: {
		width: "100%",
		alignItems: "center",
		marginBottom: 10,
	},
	titleLine: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
	},
	loader: {
		marginVertical: 30,
	},
	list: {
		width: "100%",
		gap: 6,
	},
	row: {
		width: "100%",
		minHeight: 56,
		borderWidth: 1.5,
		borderRadius: 12,
		paddingVertical: 10,
		paddingHorizontal: 10,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 10,
	},
	medalBadge: {
		width: 44,
		height: 44,
		borderRadius: 10,
		borderWidth: 1.5,
		alignItems: "center",
		justifyContent: "center",
	},
	titleBlock: {
		flex: 1,
		minWidth: 0,
	},
	chainTitle: {
		flex: 1,
		fontFamily: "Silkscreen",
		fontSize: 9,
	},
	title: {
		fontFamily: "SilkscreenBold",
		fontSize: 12,
		marginTop: 2,
	},
	progress: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		textAlign: "right",
	},
	progressTrack: {
		width: "100%",
		height: 8,
		borderRadius: 4,
		marginTop: 6,
		overflow: "hidden",
		backgroundColor: "rgba(255, 255, 255, 0.10)",
	},
	progressFill: {
		height: "100%",
		borderRadius: 4,
	},
	howTo: {
		fontFamily: "Silkscreen",
		fontSize: 9,
		lineHeight: 12,
		marginTop: 2,
	},
	pipRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		marginTop: 6,
	},
	pip: {
		width: 8,
		height: 8,
		borderWidth: 1.5,
		borderRadius: 2,
	},
	pipText: {
		fontFamily: "Silkscreen",
		fontSize: 8,
		marginLeft: 4,
	},
	rewardChip: {
		alignItems: "center",
		gap: 2,
		minWidth: 44,
	},
	rewardText: {
		fontFamily: "SilkscreenBold",
		fontSize: 10,
	},
});
