import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import StylizedButton from "./StylizedButton";
import GlobalScoreRow from "./GlobalScoreRow";
import { cssColors } from "@/constants/Color";
import { GameModeType } from "@/hooks/useAppState";
import { useTheme } from "@/constants/Theme";
import { CHALLENGE_LEADERBOARD_GAME_MODES, getGameModeConfig } from "@/constants/GameModes";
import { getGlobalHighScores, GlobalHighScore } from "@/constants/Supabase";
import { useLanguage } from "@/constants/Localization";

const LEADERBOARD_LIMIT = 100;

// Global leaderboards of the challenge modes (Daily, Speed, Move Limit), shown inside the Challenges menu.
export default function ChallengeLeaderboard() {
    const { t } = useLanguage();
    const { currentTheme } = useTheme();
    const { width, height } = useWindowDimensions();
    const isMobile = width < 600 || height < 700;
    const [gameMode, setGameMode] = useState<GameModeType>(GameModeType.DailyPuzzle);
    const [scores, setScores] = useState<GlobalHighScore[]>([]);
    const [loading, setLoading] = useState(false);
    const requestId = useRef(0);
    const config = getGameModeConfig(gameMode);

    const refresh = useCallback(async () => {
        const id = ++requestId.current;
        setLoading(true);
        const remote = await getGlobalHighScores(gameMode, LEADERBOARD_LIMIT);
        if (id !== requestId.current) return;
        setScores(remote);
        setLoading(false);
    }, [gameMode]);

    useEffect(() => {
        void refresh();
        return () => {
            requestId.current += 1;
        };
    }, [refresh]);

    return (
        <View style={styles.container}>
            <View style={styles.modeRow}>
                {CHALLENGE_LEADERBOARD_GAME_MODES.map((mode) => {
                    const modeConfig = getGameModeConfig(mode);
                    const isSelected = gameMode === mode;
                    return (
                        <StylizedButton
                            key={mode}
                            text={modeConfig.shortTitle}
                            onClick={() => setGameMode(mode)}
                            backgroundColor={isSelected ? modeConfig.challenge?.color ?? currentTheme.buttonPrimary : cssColors.spaceGray}
                            style={styles.modeButton}
                            textStyle={isMobile && styles.mobileButtonText}
                        />
                    );
                })}
            </View>

            <Text style={[styles.header, { color: currentTheme.textPrimary }, isMobile && { fontSize: 22 }]}>
                {t("hs.leaderboardTitle", { mode: config.leaderboardTitle })}
            </Text>
            <View style={styles.metaRow}>
                <StylizedButton
                    text={loading ? "..." : t("hs.refresh")}
                    onClick={() => void refresh()}
                    backgroundColor={currentTheme.buttonSecondary}
                    disabled={loading}
                    style={styles.refreshButton}
                    textStyle={styles.refreshButtonText}
                />
            </View>

            {loading && <ActivityIndicator size="large" color={currentTheme.textPrimary} />}

            {!loading && scores.length > 0 && (
                <View style={styles.scoreList}>
                    {scores.map((score, idx) => (
                        <GlobalScoreRow key={score.id || idx} rank={idx + 1} score={score} highlightTop={false} />
                    ))}
                </View>
            )}

            {!loading && scores.length === 0 && (
                <Text style={[styles.noScoresText, { color: currentTheme.textPrimary }, isMobile && { fontSize: 20 }]}>
                    {t("hs.noGlobalScores")}
                </Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: "100%",
        alignItems: "center",
        gap: 6,
    },
    modeRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
        justifyContent: "center",
        width: "90%",
        marginTop: 4,
    },
    modeButton: {
        minWidth: 100,
        maxWidth: 150,
        flexGrow: 1,
        flexBasis: 100,
    },
    mobileButtonText: {
        fontSize: 14,
    },
    header: {
        fontSize: 30,
        fontFamily: "Silkscreen",
        textAlign: "center",
    },
    metaRow: {
        width: "94%",
        flexDirection: "row",
        justifyContent: "flex-end",
    },
    refreshButton: {
        minWidth: 92,
        minHeight: 32,
        height: 32,
        paddingHorizontal: 8,
        paddingVertical: 4,
        margin: 0,
    },
    refreshButtonText: {
        fontSize: 10,
    },
    scoreList: {
        width: "94%",
        gap: 6,
        marginTop: 4,
    },
    noScoresText: {
        fontSize: 30,
        fontFamily: "Silkscreen",
        textAlign: "center",
        marginVertical: 20,
    },
});
