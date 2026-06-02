import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import { GameModeType, useAppState } from "@/hooks/useAppState";
import { useTheme } from "@/constants/Theme";
import { getHighScores } from "@/constants/Storage";
import { cssColors } from "@/constants/Color";
import Animated, { FadeIn } from "react-native-reanimated";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { checkSupabaseConnection } from "@/constants/Connectivity";
import OfflinePlayPrompt from "./OfflinePlayPrompt";

export default function DailyChallengesMenu() {
    const { currentTheme } = useTheme();
    const [, setAppState, , popAppState] = useAppState();
    const { width } = useWindowDimensions();
    const isMobile = width < 600;

    const [dailyBest, setDailyBest] = useState<number>(0);
    const [speedBest, setSpeedBest] = useState<number>(0);
    const [pendingOfflineMode, setPendingOfflineMode] = useState<GameModeType | null>(null);
    const [checkingMode, setCheckingMode] = useState<GameModeType | null>(null);
    const handleBack = useCallback(() => {
        popAppState();
    }, [popAppState]);

    useEscapeKey(handleBack);

    useEffect(() => {
        // Load best scores
        getHighScores(GameModeType.DailyPuzzle, true, true, 1).then((scores) => {
            if (scores && scores.length > 0) {
                setDailyBest(scores[0].score);
            }
        });
        getHighScores(GameModeType.TimeAttack, true, true, 1).then((scores) => {
            if (scores && scores.length > 0) {
                setSpeedBest(scores[0].score);
            }
        });
    }, []);

    const startMode = async (mode: GameModeType) => {
        if (checkingMode) return;
        setCheckingMode(mode);
        const online = await checkSupabaseConnection();
        setCheckingMode(null);

        if (online) {
            setAppState(mode);
        } else {
            setPendingOfflineMode(mode);
        }
    };

    const startDailyPuzzle = () => {
        startMode(GameModeType.DailyPuzzle);
    };

    const startTimeAttack = () => {
        startMode(GameModeType.TimeAttack);
    };

    return (
        <SimplePopupView style={[
            { justifyContent: 'flex-start', backgroundColor: currentTheme.menuBackground },
            isMobile && { width: '92%', height: '90%', paddingHorizontal: 10 }
        ]}>
            <Animated.View entering={FadeIn} style={styles.contentContainer}>
                <StylizedButton text="Back" onClick={handleBack} backgroundColor={cssColors.spaceGray} style={styles.backBtn} />

                <Text style={[styles.header, { color: currentTheme.textPrimary }]}>Challenges</Text>
                <Text style={[styles.subHeader, { color: currentTheme.textSecondary }]}>Daily tests of skill & speed</Text>

                {/* Challenge 1: Daily Puzzle */}
                <View style={[styles.challengeCard, { borderColor: currentTheme.textSecondary, backgroundColor: 'rgba(0, 0, 0, 0.2)' }]}>
                    <Text style={[styles.cardTitle, { color: '#FFD700' }]}>📅 Daily Puzzle</Text>
                    <Text style={[styles.cardDesc, { color: currentTheme.textPrimary }]}>
                        Play today's seeded layout! Everyone gets the same pre-filled board and sequence of pieces today.
                    </Text>
                    <View style={styles.cardFooter}>
                        <Text style={[styles.bestScoreText, { color: currentTheme.textSecondary }]}>
                            Personal Best: <Text style={{ color: currentTheme.accent, fontWeight: 'bold' }}>{dailyBest}</Text>
                        </Text>
                        <StylizedButton 
                            text={checkingMode === GameModeType.DailyPuzzle ? "Checking..." : "Play Puzzle"} 
                            onClick={startDailyPuzzle} 
                            backgroundColor={currentTheme.buttonPrimary} 
                            style={styles.playBtn}
                            textStyle={{ fontSize: 13 }}
                        />
                    </View>
                </View>

                {/* Challenge 2: Speed Game */}
                <View style={[styles.challengeCard, { borderColor: currentTheme.textSecondary, backgroundColor: 'rgba(0, 0, 0, 0.2)' }]}>
                    <Text style={[styles.cardTitle, { color: '#00FFCC' }]}>⚡ Speed Game</Text>
                    <Text style={[styles.cardDesc, { color: currentTheme.textPrimary }]}>
                        Start with 60 seconds. Clearing lines (+5s) and scoring points extends your time!
                    </Text>
                    <View style={styles.cardFooter}>
                        <Text style={[styles.bestScoreText, { color: currentTheme.textSecondary }]}>
                            Personal Best: <Text style={{ color: currentTheme.accent, fontWeight: 'bold' }}>{speedBest}</Text>
                        </Text>
                        <StylizedButton 
                            text={checkingMode === GameModeType.TimeAttack ? "Checking..." : "Play Speed"} 
                            onClick={startTimeAttack} 
                            backgroundColor={cssColors.versusBlue} 
                            style={styles.playBtn}
                            textStyle={{ fontSize: 13 }}
                        />
                    </View>
                </View>
            </Animated.View>
            {pendingOfflineMode && (
                <OfflinePlayPrompt
                    gameMode={pendingOfflineMode}
                    onContinue={() => {
                        const mode = pendingOfflineMode;
                        setPendingOfflineMode(null);
                        setAppState(mode);
                    }}
                    onCancel={() => setPendingOfflineMode(null)}
                />
            )}
        </SimplePopupView>
    );
}

const styles = StyleSheet.create({
    contentContainer: {
        width: '100%',
        alignItems: 'center',
    },
    backBtn: {
        alignSelf: 'flex-start',
    },
    header: {
        fontSize: 28,
        fontFamily: 'Silkscreen',
        marginTop: 10,
        textAlign: 'center',
    },
    subHeader: {
        fontSize: 14,
        fontFamily: 'Silkscreen',
        marginBottom: 20,
        textAlign: 'center',
    },
    challengeCard: {
        width: '90%',
        borderWidth: 2,
        borderRadius: 12,
        padding: 15,
        marginVertical: 10,
        gap: 8,
    },
    cardTitle: {
        fontSize: 18,
        fontFamily: 'Silkscreen',
        fontWeight: 'bold',
    },
    cardDesc: {
        fontSize: 12,
        fontFamily: 'Silkscreen',
        lineHeight: 16,
    },
    cardFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 5,
    },
    bestScoreText: {
        fontSize: 11,
        fontFamily: 'Silkscreen',
    },
    playBtn: {
        minWidth: 110,
        height: 34,
    }
});
