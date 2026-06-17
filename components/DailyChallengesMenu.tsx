import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import { GameModeType, useAppState } from "@/hooks/useAppState";
import { useTheme } from "@/constants/Theme";
import { getHighScores } from "@/constants/Storage";
import { cssColors } from "@/constants/Color";
import Animated, { FadeIn } from "react-native-reanimated";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { shouldCheckConnectionBeforeStart } from "@/constants/GameStart";
import { CHALLENGE_MODE_CARDS, ChallengeCard, getGameModeConfig } from "@/constants/GameModes";

type BestScoreMap = Partial<Record<GameModeType, number>>;

function isPlayableCard(card: ChallengeCard): card is Extract<ChallengeCard, { type: "playable" }> {
    return card.type === "playable";
}

export default function DailyChallengesMenu() {
    const { currentTheme } = useTheme();
    const [, setAppState, , popAppState] = useAppState();
    const { width } = useWindowDimensions();
    const isMobile = width < 600;

    const [bestScores, setBestScores] = useState<BestScoreMap>({});
    const [checkingMode, setCheckingMode] = useState<GameModeType | null>(null);
    const handleBack = useCallback(() => {
        popAppState();
    }, [popAppState]);

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

    const renderCard = (card: ChallengeCard) => {
        const isPlayable = card.type === "playable";
        const config = isPlayable ? getGameModeConfig(card.mode) : undefined;
        const title = isPlayable ? config!.title : card.title;
        const color = isPlayable ? config!.challenge?.color ?? currentTheme.buttonPrimary : card.color;
        const description = isPlayable ? config!.challenge?.description ?? "" : card.description;
        const tags: string[] = isPlayable ? config!.challenge?.tags ?? [] : card.tags;
        const bestScore = isPlayable ? bestScores[card.mode] ?? 0 : 0;
        const isChecking = isPlayable && checkingMode === card.mode;

        return (
            <View
                key={isPlayable ? card.mode : card.id}
                style={[
                    styles.challengeRow,
                    {
                        borderColor: currentTheme.textSecondary,
                        backgroundColor: "rgba(0, 0, 0, 0.24)",
                    },
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
                    <Text style={[styles.cardDesc, { color: currentTheme.textPrimary }]} numberOfLines={2}>
                        {description}
                    </Text>
                    <View style={styles.tagRow}>
                        {tags.map((tag) => (
                            <View key={tag} style={[styles.tag, { borderColor: color }]}>
                                <Text style={[styles.tagText, { color }]} numberOfLines={1}>
                                    {tag}
                                </Text>
                            </View>
                        ))}
                    </View>
                </View>

                <View style={[styles.cardAction, isMobile && styles.mobileCardAction]}>
                    <Text style={[styles.bestScoreText, { color: currentTheme.textSecondary }]}>
                        Best
                    </Text>
                    <Text style={[styles.bestScoreValue, { color: currentTheme.accent }]} numberOfLines={1} adjustsFontSizeToFit>
                        {isPlayable ? bestScore : "-"}
                    </Text>
                    <StylizedButton
                        text={isPlayable ? (isChecking ? "Checking" : config?.challenge?.buttonText ?? "Play") : "Next"}
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
                <StylizedButton text="Back" onClick={handleBack} backgroundColor={cssColors.spaceGray} style={styles.backBtn} />

                <Text style={[styles.header, { color: currentTheme.textPrimary }]}>Challenges</Text>
                <Text style={[styles.subHeader, { color: currentTheme.textSecondary }]}>Daily tests, speed runs, and tactical trials</Text>

                <View style={styles.challengeList}>
                    {CHALLENGE_MODE_CARDS.map(renderCard)}
                </View>
            </Animated.View>
        </SimplePopupView>
    );
}

const styles = StyleSheet.create({
    contentContainer: {
        width: "100%",
        alignItems: "center",
    },
    backBtn: {
        alignSelf: "flex-start",
        minWidth: 130,
    },
    header: {
        fontSize: 28,
        fontFamily: "Silkscreen",
        marginTop: 8,
        textAlign: "center",
    },
    subHeader: {
        fontSize: 12,
        fontFamily: "Silkscreen",
        marginBottom: 14,
        textAlign: "center",
    },
    challengeList: {
        width: "94%",
        gap: 8,
    },
    challengeRow: {
        width: "100%",
        minHeight: 112,
        borderWidth: 2,
        borderRadius: 8,
        padding: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    mobileChallengeRow: {
        minHeight: 118,
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
        minHeight: 30,
        height: 30,
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
