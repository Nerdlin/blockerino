import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import SimplePopupView from "./SimplePopupView";
import ChallengeLeaderboard from "./ChallengeLeaderboard";
import StylizedButton from "./StylizedButton";
import { GameModeType, useAppState } from "@/hooks/useAppState";
import { useTheme } from "@/constants/Theme";
import { getHighScores } from "@/constants/Storage";
import { getMyServerHighScore } from "@/constants/Supabase";
import { cssColors } from "@/constants/Color";
import Animated, { FadeIn } from "react-native-reanimated";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { shouldCheckConnectionBeforeStart } from "@/constants/GameStart";
import { CHALLENGE_MODE_CARDS, ChallengeCard, getGameModeConfig } from "@/constants/GameModes";
import { useLanguage } from "@/constants/Localization";
import UiIcon from "./UiIcon";
import { noteAchievementHighWater } from "@/constants/Achievements";
import { countChallengeStars, dailyStreak, getDailyPuzzleDays, MAX_CHALLENGE_STARS, msUntilNextPuzzle, nextGoal, puzzleDayKey, starsForScore } from "@/constants/ChallengeProgress";

type BestScoreMap = Partial<Record<GameModeType, number>>;

function isPlayableCard(card: ChallengeCard): card is Extract<ChallengeCard, { type: "playable" }> {
    return card.type === "playable";
}

export default function DailyChallengesMenu() {
    const { currentTheme } = useTheme();
    const { t } = useLanguage();
    const [, setAppState, , popAppState] = useAppState();
    const { width } = useWindowDimensions();
    const isMobile = width < 600;

    const [bestScores, setBestScores] = useState<BestScoreMap>({});
    const [streak, setStreak] = useState(0);
    const [untilNext, setUntilNext] = useState(msUntilNextPuzzle());
    useEffect(() => {
        const timer = setInterval(() => setUntilNext(msUntilNextPuzzle()), 30000);
        return () => clearInterval(timer);
    }, []);
    const [checkingMode, setCheckingMode] = useState<GameModeType | null>(null);
    const [showRating, setShowRating] = useState(false);
    const handleBack = useCallback(() => {
        if (showRating) {
            setShowRating(false);
            return;
        }
        popAppState();
    }, [popAppState, showRating]);

    useEscapeKey(handleBack);

    const playableCards = useMemo(
        () => CHALLENGE_MODE_CARDS.filter(isPlayableCard),
        []
    );

    useEffect(() => {
        let isMounted = true;

        Promise.all(
            playableCards.map(async (card) => {
                // the Daily Puzzle is a new board every day: its card shows today's best
                if (card.mode === GameModeType.DailyPuzzle) {
                    const days = await getDailyPuzzleDays();
                    if (isMounted) setStreak(dailyStreak(days));
                    return [card.mode, days[puzzleDayKey()] ?? 0] as const;
                }
                const scores = await getHighScores(card.mode, true, true, 1);
                const local = scores[0]?.score ?? 0;
                // a fresh install or another device has no local record: the account's record from the server counts too
                const server = await getMyServerHighScore(card.mode);
                return [card.mode, Math.max(local, server ?? 0)] as const;
            })
        ).then((entries) => {
            if (!isMounted) return;
            const best = Object.fromEntries(entries) as BestScoreMap;
            setBestScores(best);
            noteAchievementHighWater("challengeStars", countChallengeStars(best));
        });

        return () => {
            isMounted = false;
        };
    }, [playableCards]);

    const startMode = async (mode: GameModeType) => {
        if (checkingMode) return;
        if (!shouldCheckConnectionBeforeStart(mode)) {
            setAppState(mode);
            return;
        }
        setCheckingMode(mode);
        setCheckingMode(null);
    };

    const totalStars = countChallengeStars(bestScores);
    const hours = Math.floor(untilNext / 3600000);
    const minutes = Math.floor((untilNext % 3600000) / 60000);
    const nextPuzzleIn = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

    const renderCard = (card: ChallengeCard) => {
        const isDaily = card.mode === GameModeType.DailyPuzzle;
        const config = getGameModeConfig(card.mode);
        const color = config.challenge?.color ?? currentTheme.buttonPrimary;
        const bestScore = bestScores[card.mode] ?? 0;
        const stars = starsForScore(card.mode, bestScore);
        const goal = nextGoal(card.mode, bestScore);
        const isChecking = checkingMode === card.mode;

        return (
            <View
                key={card.mode}
                style={[
                    styles.challengeRow,
                    { borderColor: color, backgroundColor: isDaily ? "rgba(255, 215, 0, 0.08)" : "rgba(0, 0, 0, 0.24)" },
                    isDaily && styles.featuredRow,
                    isMobile && styles.mobileChallengeRow,
                ]}
            >
                <View style={styles.cardMain}>
                    <Text style={[styles.cardTitle, isMobile && styles.mobileCardTitle, { color }]} numberOfLines={1} adjustsFontSizeToFit>
                        {t(`ch.title.${card.mode}`)}
                    </Text>
                    <Text style={[styles.cardDesc, { color: currentTheme.textPrimary }]} numberOfLines={2}>
                        {t(`ch.desc.${card.mode}`)}
                    </Text>
                    <View style={styles.starRow}>
                        {[0, 1, 2].map((slot) => (
                            <View key={slot} style={{ opacity: slot < stars ? 1 : 0.22 }}>
                                <UiIcon name="starGold" size={18} />
                            </View>
                        ))}
                        <Text style={[styles.goalText, { color: stars === 3 ? color : currentTheme.textSecondary }]} numberOfLines={1}>
                            {goal === null ? t("ch.allStars") : t("ch.nextGoal", { score: goal })}
                        </Text>
                    </View>
                    {isDaily && (
                        <View style={styles.dailyMeta}>
                            {streak > 0 && (
                                <View style={styles.streakChip}>
                                    <UiIcon name="fire" size={12} />
                                    <Text style={[styles.metaText, { color: "#FDBA74" }]}>{t("ch.streak", { days: streak })}</Text>
                                </View>
                            )}
                            <Text style={[styles.metaText, { color: currentTheme.textSecondary }]}>{t("ch.newIn", { time: nextPuzzleIn })}</Text>
                        </View>
                    )}
                </View>

                <View style={[styles.cardAction, isMobile && styles.mobileCardAction]}>
                    <Text style={[styles.bestScoreValue, { color: currentTheme.accent }]} numberOfLines={1} adjustsFontSizeToFit>
                        {isDaily ? t("ch.today", { score: bestScore }) : `${t("ch.best")} ${bestScore}`}
                    </Text>
                    <StylizedButton
                        text={isChecking ? t("ch.checking") : t("ch.play")}
                        onClick={() => startMode(card.mode)}
                        backgroundColor={color}
                        disabled={isChecking}
                        style={[styles.playBtn, isMobile && styles.mobilePlayBtn]}
                        textStyle={styles.playBtnText}
                    />
                </View>
            </View>
        );
    };

    return (
        <SimplePopupView style={[
            { justifyContent: "flex-start", backgroundColor: currentTheme.menuBackground },
            isMobile && { width: "92%", height: "90%", paddingHorizontal: 8 }
        ]}>
            <Animated.View entering={FadeIn} style={styles.contentContainer}>
                <View style={styles.topRow}>
                    <StylizedButton text={t("ch.back")} onClick={handleBack} backgroundColor={cssColors.spaceGray} style={styles.backBtn} textStyle={styles.topBtnText} />
                    <Text style={[styles.header, { color: currentTheme.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>{showRating ? t("ch.rating") : t("ch.header")}</Text>
                    {!showRating ? (
                        <StylizedButton
                            text={t("ch.rating")}
                            onClick={() => setShowRating(true)}
                            backgroundColor={currentTheme.buttonSecondary}
                            style={styles.backBtn}
                            textStyle={styles.topBtnText}
                        />
                    ) : (
                        <View style={styles.backBtn} />
                    )}
                </View>
                {!showRating && (
                    <View style={styles.subHeaderRow}>
                        <Text style={[styles.subHeader, { color: currentTheme.textSecondary }]} numberOfLines={2}>{t("ch.subHeader")}</Text>
                        <View style={styles.totalStars}>
                            <UiIcon name="starGold" size={18} />
                            <Text style={[styles.metaText, { color: "#FACC15" }]}>{t("ch.starsTotal", { stars: totalStars, max: MAX_CHALLENGE_STARS })}</Text>
                        </View>
                    </View>
                )}

                {showRating ? (
                    <ChallengeLeaderboard />
                ) : (
                    <View style={styles.challengeList}>
                        {CHALLENGE_MODE_CARDS.map((card) => renderCard(card))}
                    </View>
                )}
            </Animated.View>
        </SimplePopupView>
    );
}

const styles = StyleSheet.create({
    contentContainer: {
        width: "100%",
        alignItems: "center",
    },
    topRow: {
        width: "100%",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
    },
    backBtn: {
        width: 78,
        minWidth: 78,
        height: 38,
        minHeight: 38,
        margin: 0,
        paddingHorizontal: 8,
    },
    topBtnText: {
        fontSize: 12,
    },
    header: {
        flex: 1,
        fontSize: 16,
        fontFamily: "Silkscreen",
        textAlign: "center",
    },
    subHeaderRow: {
        width: "94%",
        alignItems: "center",
        gap: 6,
        marginTop: 2,
        marginBottom: 12,
    },
    subHeader: {
        fontSize: 11,
        fontFamily: "Silkscreen",
        textAlign: "center",
    },
    totalStars: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(250, 204, 21, 0.5)",
        backgroundColor: "rgba(250, 204, 21, 0.08)",
    },
    starRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        marginTop: 1,
    },
    goalText: {
        marginLeft: 4,
        flexShrink: 1,
        fontSize: 9,
        fontFamily: "Silkscreen",
    },
    dailyMeta: {
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
    },
    streakChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        backgroundColor: "rgba(249, 115, 22, 0.16)",
    },
    metaText: {
        fontSize: 9,
        fontFamily: "Silkscreen",
    },
    challengeList: {
        width: "94%",
        gap: 8,
    },
    featuredRow: {
        minHeight: 112,
        borderWidth: 2.5,
    },
    soonRow: {
        opacity: 0.55,
    },
    challengeRow: {
        width: "100%",
        minHeight: 84,
        borderWidth: 1.5,
        borderRadius: 10,
        padding: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    mobileChallengeRow: {
        minHeight: 76,
        paddingHorizontal: 8,
        gap: 7,
    },
    cardMain: {
        flex: 1,
        minWidth: 0,
        gap: 5,
    },
    cardTitle: {
        fontSize: 18,
        fontFamily: "SilkscreenBold",
    },
    mobileCardTitle: {
        fontSize: 14,
        lineHeight: 17,
    },
    cardDesc: {
        fontSize: 10,
        fontFamily: "Silkscreen",
        lineHeight: 14,
    },
    tagRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 4,
        marginTop: 1,
    },
    tag: {
        borderWidth: 1,
        borderRadius: 4,
        paddingHorizontal: 5,
        paddingVertical: 2,
        backgroundColor: "rgba(255, 255, 255, 0.04)",
        maxWidth: 82,
    },
    tagText: {
        fontSize: 8,
        fontFamily: "Silkscreen",
    },
    cardAction: {
        width: 112,
        alignItems: "center",
        gap: 2,
    },
    mobileCardAction: {
        width: 96,
    },
    bestScoreText: {
        fontSize: 9,
        fontFamily: "Silkscreen",
    },
    bestScoreValue: {
        width: "100%",
        fontSize: 15,
        fontFamily: "SilkscreenBold",
        textAlign: "center",
    },
    playBtn: {
        minWidth: 102,
        width: 102,
        minHeight: 36,
        height: 36,
        paddingHorizontal: 4,
        paddingVertical: 3,
        marginTop: 4,
    },
    mobilePlayBtn: {
        minWidth: 90,
        width: 90,
    },
    playBtnText: {
        fontSize: 10,
    },
});
