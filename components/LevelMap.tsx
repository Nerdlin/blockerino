import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAtom, useSetAtom } from "jotai";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { CHAPTERS, LEVELS, LEVELS_PER_CHAPTER, currentLevelAtom } from "@/constants/Levels";
import { ChapterChestKind, chapterStars, claimChapterChest, isLevelUnlocked, levelProgressAtom, loadLevelProgress, totalStars } from "@/constants/LevelProgress";
import { GameModeType, useSetAppState } from "@/hooks/useAppState";
import { useLanguage } from "@/constants/Localization";
import { useTheme } from "@/constants/Theme";
import { useSoundSettings } from "@/constants/Sound";
import { loadShopState, useShopState, getShopItem } from "@/constants/Shop";
import { shopItemText } from "@/constants/i18n/shopItems";
import { RARITY_COLORS, type ChestPrize } from "@/constants/DailyReward";
import { PixelChest } from "./DailyCalendar";
import CosmeticPreview from "./CosmeticPreview";
import StylizedButton from "./StylizedButton";
import UiIcon from "./UiIcon";

function ChestReveal({ prize, onClose }: { prize: ChestPrize; onClose: () => void }) {
	const { t, language } = useLanguage();
	const shake = useSharedValue(0);
	const scale = useSharedValue(1);
	const show = useSharedValue(0);
	useEffect(() => {
		shake.value = withSequence(withTiming(-12, { duration: 70 }), withTiming(12, { duration: 70 }), withTiming(-10, { duration: 70 }), withTiming(10, { duration: 70 }), withTiming(0, { duration: 70 }));
		scale.value = withSequence(withDelay(350, withTiming(1.25, { duration: 160 })), withSpring(1));
		show.value = withDelay(650, withTiming(1, { duration: 320 }));
	}, [scale, shake, show]);
	const chestStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${shake.value}deg` }, { scale: scale.value }] }));
	const prizeStyle = useAnimatedStyle(() => ({ opacity: show.value, transform: [{ scale: 0.6 + 0.4 * show.value }] }));
	const item = prize.kind === "item" ? getShopItem(prize.itemId) : undefined;
	return (
		<View style={styles.revealBackdrop}>
			<View style={styles.revealCard}>
				<Animated.View style={[styles.burst, { backgroundColor: RARITY_COLORS[prize.rarity] }, prizeStyle]} />
				<Animated.View style={chestStyle}><PixelChest size={prize.size === "big" ? 96 : 72} kind={prize.size} open /></Animated.View>
				<Animated.View style={[styles.prize, prizeStyle]}>
					{item ? (
						<>
							<Text style={[styles.rarity, { color: RARITY_COLORS[prize.rarity] }]}>{t(`daily.rarity.${prize.rarity}`)}</Text>
							<CosmeticPreview item={item} />
							<Text style={styles.prizeText}>{t("daily.chestItem", { name: shopItemText(item, language).title })}</Text>
							{prize.coins > 0 && <Text style={styles.prizeText}>{t("daily.reward", { coins: prize.coins })}</Text>}
						</>
					) : (
						<Text style={styles.prizeText}>{t("daily.chestCoins", { coins: prize.coins })}</Text>
					)}
				</Animated.View>
				<StylizedButton text={t("daily.ok")} onClick={onClose} backgroundColor="#2E7D32" />
			</View>
		</View>
	);
}

/** The level map: chapters of 10 levels, stars, chapter chests. Levels open one after another. */
export default function LevelMap() {
	const { t } = useLanguage();
	const { currentTheme } = useTheme();
	const { playSfx } = useSoundSettings();
	const { commit } = useShopState();
	const [setAppState] = useSetAppState();
	const setLevel = useSetAtom(currentLevelAtom);
	const [progress, setProgress] = useAtom(levelProgressAtom);
	const [busy, setBusy] = useState<string | null>(null);
	const [note, setNote] = useState<string | null>(null);
	const [prize, setPrize] = useState<ChestPrize | null>(null);

	useEffect(() => {
		let active = true;
		void loadLevelProgress().then((next) => { if (active) setProgress(next); });
		return () => { active = false; };
	}, [setProgress]);

	const play = useCallback((id: string) => {
		playSfx("menuClick");
		setLevel(id);
		setAppState(GameModeType.Level);
	}, [playSfx, setAppState, setLevel]);

	const openChest = async (chapter: number, kind: ChapterChestKind) => {
		if (busy) return;
		setBusy(`${chapter}:${kind}`);
		setNote(null);
		const result = await claimChapterChest(chapter, kind);
		setBusy(null);
		if (result.status === "guest") return setNote(t("levels.chestSignIn"));
		if (result.status === "error" || result.status === "locked") return setNote(t("daily.failed"));
		setProgress((current) => ({ ...current, chests: [...current.chests, `${chapter}:${kind}`] }));
		if (result.status === "opened" && result.chest) {
			const latest = await loadShopState();
			await commit({
				...latest,
				balance: result.coins ?? latest.balance,
				ownedItemIds: result.ownedItemIds ? Array.from(new Set([...latest.ownedItemIds, ...result.ownedItemIds])) : latest.ownedItemIds,
			}, []);
			playSfx("achievement");
			setPrize(result.chest);
		}
	};

	const stars = progress.stars;
	return (
		<View style={styles.wrap} testID="level-map">
			<Text style={[styles.total, { color: "#FACC15" }]}>★ {totalStars(stars)} / {LEVELS.length * 3}</Text>
			{note && <Text style={[styles.note, { color: currentTheme.textSecondary }]}>{note}</Text>}
			{CHAPTERS.map(({ chapter, color }) => {
				const summary = chapterStars(stars, chapter);
				const chapterOpen = isLevelUnlocked(stars, (chapter - 1) * LEVELS_PER_CHAPTER + 1);
				const chest = (kind: ChapterChestKind, size: "small" | "big", ready: boolean) => {
					const opened = progress.chests.includes(`${chapter}:${kind}`);
					return (
						<Pressable
							key={kind}
							testID={`chapter-chest-${chapter}-${kind}`}
							disabled={!ready || opened || busy !== null}
							onPress={() => void openChest(chapter, kind)}
							style={[styles.chestBtn, ready && !opened && { borderColor: "#FFD700", backgroundColor: "rgba(255,215,0,0.15)" }, !ready && { opacity: 0.4 }]}
						>
							<PixelChest size={30} kind={size} open={opened} />
							<Text style={styles.chestLabel}>{opened ? "✓" : kind === "complete" ? `${summary.won}/10` : `${summary.perfect}/10★`}</Text>
						</Pressable>
					);
				};
				return (
					<View key={chapter} style={[styles.chapter, { borderColor: color }, !chapterOpen && { opacity: 0.55 }]}>
						<View style={styles.chapterHead}>
							<View style={{ flex: 1 }}>
								<Text style={[styles.chapterTitle, { color }]}>{t(`levels.chapter.${chapter}`)}</Text>
								<Text style={[styles.chapterSub, { color: currentTheme.textSecondary }]}>{t(`levels.chapterHint.${chapter}`)} · ★ {summary.stars}/30</Text>
							</View>
							{chest("complete", "small", summary.won >= LEVELS_PER_CHAPTER)}
							{chest("perfect", "big", summary.perfect >= LEVELS_PER_CHAPTER)}
						</View>
						<View style={styles.levels}>
							{LEVELS.filter((level) => level.chapter === chapter).map((level) => {
								const s = stars[level.id] ?? 0;
								const open = isLevelUnlocked(stars, level.number);
								const current = open && s === 0;
								return (
									<Pressable
										key={level.id}
										testID={`level-${level.id}`}
										disabled={!open}
										onPress={() => play(level.id)}
										style={[styles.node, { borderColor: open ? color : "rgba(255,255,255,0.15)" }, current && { backgroundColor: color }, !open && styles.lockedNode]}
									>
										{open ? (
											<Text style={[styles.nodeNumber, { color: current ? "#000" : "#fff" }]}>{level.index}</Text>
										) : (
											<UiIcon name="lock" size={18} dimmed />
										)}
										<Text style={styles.nodeStars}>
											{[1, 2, 3].map((n) => (
												<Text key={n} style={{ color: n <= s ? "#FFD700" : "rgba(255,255,255,0.2)" }}>★</Text>
											))}
										</Text>
									</Pressable>
								);
							})}
						</View>
					</View>
				);
			})}
			{prize && <ChestReveal prize={prize} onClose={() => setPrize(null)} />}
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		width: "100%",
		gap: 12,
		alignItems: "stretch",
	},
	total: {
		fontFamily: "Silkscreen",
		fontSize: 14,
		textAlign: "center",
	},
	note: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		textAlign: "center",
	},
	chapter: {
		borderWidth: 2,
		borderRadius: 12,
		padding: 10,
		gap: 10,
		backgroundColor: "rgba(255,255,255,0.03)",
	},
	chapterHead: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	chapterTitle: {
		fontFamily: "Silkscreen",
		fontSize: 15,
	},
	chapterSub: {
		fontFamily: "Silkscreen",
		fontSize: 9,
		marginTop: 2,
	},
	chestBtn: {
		alignItems: "center",
		borderWidth: 2,
		borderColor: "rgba(255,255,255,0.15)",
		borderRadius: 8,
		paddingHorizontal: 4,
		paddingVertical: 2,
	},
	chestLabel: {
		fontFamily: "Silkscreen",
		fontSize: 8,
		color: "#FFD700",
	},
	levels: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "center",
		gap: 6,
	},
	node: {
		width: 46,
		height: 46,
		borderRadius: 23,
		borderWidth: 3,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(0,0,0,0.35)",
	},
	lockedNode: {
		backgroundColor: "rgba(255,255,255,0.04)",
	},
	nodeNumber: {
		fontFamily: "Silkscreen",
		fontSize: 16,
	},
	nodeStars: {
		fontSize: 9,
		marginTop: -2,
	},
	revealBackdrop: {
		position: "absolute",
		left: -20,
		right: -20,
		top: -20,
		bottom: -20,
		backgroundColor: "rgba(0,0,0,0.75)",
		alignItems: "center",
		justifyContent: "flex-start",
		paddingTop: 60,
		zIndex: 50,
	},
	revealCard: {
		alignItems: "center",
		gap: 10,
		padding: 16,
		borderRadius: 14,
		backgroundColor: "#111",
		borderWidth: 2,
		borderColor: "#FFD700",
		minWidth: 240,
	},
	burst: {
		position: "absolute",
		top: 6,
		width: 150,
		height: 150,
		borderRadius: 75,
		opacity: 0.25,
	},
	prize: {
		alignItems: "center",
		gap: 6,
	},
	rarity: {
		fontFamily: "Silkscreen",
		fontSize: 16,
	},
	prizeText: {
		fontFamily: "Silkscreen",
		fontSize: 14,
		color: "#FFD700",
		textAlign: "center",
	},
});
