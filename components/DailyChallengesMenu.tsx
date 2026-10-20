import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import SimplePopupView from "./SimplePopupView";
import ChallengeLeaderboard from "./ChallengeLeaderboard";
import StylizedButton from "./StylizedButton";
import { GameModeType, useAppState } from "@/hooks/useAppState";
import { useTheme } from "@/constants/Theme";
import { getHighScores } from "@/constants/Storage";
import { cssColors } from "@/constants/Color";
import Animated, { FadeIn } from "react-native-reanimated";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { shouldCheckConnectionBeforeStart } from "@/constants/GameStart";
import { CHALLENGE_MODE_CARDS, ChallengeCard, getGameModeConfig } from "@/constants/GameModes";
import { useLanguage } from "@/constants/Localization";

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
                const scores = await getHighScores(card.mode, true, true, 1);
                return [card.mode, scores[0]?.score ?? 0] as const;
            })
        ).then((entries) => {
            if (!isMounted) return;
            setBestScores(Object.fromEntries(entries) as BestScoreMap);
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

    const renderCard = (card: ChallengeCard, index: number) => {
        const featured = index === 0 && card.type === "playable";
        const isPlayable = card.type === "playable";
        const config = isPlayable ? getGameModeConfig(card.mode) : undefined;
        const title = isPlayable ? config!.title : card.title;
        const color = isPlayable ? config!.challenge?.color ?? currentTheme.buttonPrimary : card.color;
        const description = isPlayable ? config!.challenge?.description ?? "" : card.description;
                const bestScore = isPlayable ? bestScores[card.mode] ?? 0 : 0;
        const isChecking = isPlayable && checkingMode === card.mode;

        return (
            <View
                key={isPlayable ? card.mode : card.id}
                style={[
                    styles.challengeRow,
                    {
                        borderColor: color,
                        backgroundColor: featured ? "rgba(255, 215, 0, 0.08)" : "rgba(0, 0, 0, 0.24)",
                    },
                    featured && styles.featuredRow,
                    !isPlayable && styles.soonRow,
                    isMobile && styles.mobileChallengeRow,
                ]}
            >
                <View style={styles.cardMain}>
                    <Text
                        style={[styles.cardTitle, isMobile && styles.mobileCardTitle, { color }]}
                        numberOfLines={isMobile ? 2 : 1}
                        adjustsFontSizeToFit
                    >
                        {title}
                    </Text>
                    <Text style={[styles.cardDesc, { color: currentTheme.textPrimary }]} numberOfLines={featured ? 2 : 1}>
                        {description}
                    </Text>
                </View>

                <View style={[styles.cardAction, isMobile && styles.mobileCardAction]}>
                    {isPlayable && (
                        <Text style={[styles.bestScoreValue, { color: currentTheme.accent }]} numberOfLines={1} adjustsFontSizeToFit>
                            {t("ch.best")} {bestScore}
                        </Text>
                    )}
                    <StylizedButton
                        text={isPlayable ? (isChecking ? t("ch.checking") : config?.challenge?.buttonText ?? t("ch.play")) : t("ch.soon")}
                        onClick={isPlayable ? () => startMode(card.mode) : undefined}
                        backgroundColor={isPlayable ? color : cssColors.spaceGray}
                        disabled={!isPlayable || isChecking}
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
                    <Text style={[styles.subHeader, { color: currentTheme.textSecondary }]}>{t("ch.subHeader")}</Text>
                )}

                {showRating ? (
                    <ChallengeLeaderboard />
                ) : (
                    <View style={styles.challengeList}>
                        {CHALLENGE_MODE_CARDS.map((card, index) => renderCard(card, index))}
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
        width: 90,
        minWidth: 90,
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
        fontSize: 20,
        fontFamily: "Silkscreen",
        textAlign: "center",
    },
    subHeader: {
        fontSize: 11,
        fontFamily: "Silkscreen",
        marginTop: 2,
        marginBottom: 12,
        textAlign: "center",
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
