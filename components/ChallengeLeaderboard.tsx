import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import SegmentedControl from "./SegmentedControl";
import UiIcon from "./UiIcon";
import GlobalScoreRow from "./GlobalScoreRow";
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
            <SegmentedControl
                items={CHALLENGE_LEADERBOARD_GAME_MODES.map((mode) => {
                    const modeConfig = getGameModeConfig(mode);
                    return { key: mode, label: modeConfig.shortTitle, color: modeConfig.challenge?.color ?? currentTheme.buttonPrimary };
                })}
                value={gameMode}
                onChange={setGameMode}
            />

            <View style={styles.metaRow}>
                <Text style={[styles.header, { color: currentTheme.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
                    {t("hs.leaderboardTitle", { mode: config.leaderboardTitle })}
                </Text>
                <Pressable
                    onPress={() => void refresh()}
                    disabled={loading}
                    accessibilityLabel={t("hs.refresh")}
                    style={[styles.refreshIcon, loading && { opacity: 0.5 }]}
                >
                    <UiIcon name="refresh" size={18} />
                </Pressable>
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
    header: {
        flex: 1,
        fontSize: 14,
        fontFamily: "Silkscreen",
    },
    metaRow: {
        width: "92%",
        maxWidth: 420,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        marginTop: 6,
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
