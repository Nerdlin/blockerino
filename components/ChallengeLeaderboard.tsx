import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import PixelLoader from "@/components/PixelLoader";
import SegmentedControl from "./SegmentedControl";
import UiIcon from "./UiIcon";
import GlobalScoreRow from "./GlobalScoreRow";
import { LeaderboardMeCard, LeaderboardPodium } from "./LeaderboardPodium";
import { GameModeType } from "@/hooks/useAppState";
import { useTheme } from "@/constants/Theme";
import { CHALLENGE_LEADERBOARD_GAME_MODES, getGameModeConfig } from "@/constants/GameModes";
import { getDailyPuzzleLeaderboard, getGlobalHighScores, GlobalHighScore } from "@/constants/Supabase";
import { getHighScores } from "@/constants/Storage";
import { getDailyPuzzleDays, puzzleDayKey } from "@/constants/ChallengeProgress";
import { useLanguage } from "@/constants/Localization";
import { useAccountIdentity } from "@/hooks/useAccountIdentity";
import { useOpenPlayerProfile } from "@/constants/PlayerProfile";

const LEADERBOARD_LIMIT = 100;
const PLAYER_NAME_KEY = "PLAYER_NAME";

type BoardRow = GlobalHighScore & { is_me?: boolean };

// Global leaderboards of the challenges, inside the Challenges menu, in the style of the other tables: the player's
// own card, a podium for the top three and rows from fourth place. The Daily Puzzle shows today's puzzle only.
export default function ChallengeLeaderboard() {
    const { t } = useLanguage();
    const { currentTheme } = useTheme();
    const { width, height } = useWindowDimensions();
    const isMobile = width < 600 || height < 700;
    const { signedIn, name: accountName } = useAccountIdentity();
    const openProfile = useOpenPlayerProfile();
    const [gameMode, setGameMode] = useState<GameModeType>(GameModeType.DailyPuzzle);
    const [scores, setScores] = useState<BoardRow[]>([]);
    const [myBest, setMyBest] = useState(0);
    const [storedName, setStoredName] = useState("");
    const [loading, setLoading] = useState(false);
    const requestId = useRef(0);
    const isDaily = gameMode === GameModeType.DailyPuzzle;
    const color = getGameModeConfig(gameMode).challenge?.color ?? currentTheme.buttonPrimary;

    useEffect(() => {
        void AsyncStorage.getItem(PLAYER_NAME_KEY).then((value) => setStoredName(value ?? ""));
    }, []);

    const refresh = useCallback(async () => {
        const id = ++requestId.current;
        setLoading(true);
        const today = puzzleDayKey();
        const [remote, mine] = await Promise.all([
            isDaily ? getDailyPuzzleLeaderboard(today, LEADERBOARD_LIMIT) : getGlobalHighScores(gameMode, LEADERBOARD_LIMIT),
            isDaily
                ? getDailyPuzzleDays().then((days) => days[today] ?? 0)
                : getHighScores(gameMode, true, true, 1).then((list) => list[0]?.score ?? 0),
        ]);
        if (id !== requestId.current) return;
        setScores(remote);
        setMyBest(mine);
        setLoading(false);
    }, [gameMode, isDaily]);

    useEffect(() => {
        void refresh();
        return () => {
            requestId.current += 1;
        };
    }, [refresh]);

    const myName = (signedIn && accountName) || storedName;
    const isMe = (row: BoardRow) => row.is_me ?? (Boolean(myName) && row.player_name.toLowerCase() === myName.toLowerCase());
    const myIndex = scores.findIndex(isMe);
    // the server knows the record of an account even when this device has none
    const shownBest = isDaily ? myBest : Math.max(myBest, myIndex >= 0 ? scores[myIndex].score : 0);
    const title = isDaily ? t("ch.boardToday") : t("ch.boardAllTime", { mode: t(`ch.title.${gameMode}`) });

    return (
        <View style={styles.container}>
            <SegmentedControl
                small
                items={CHALLENGE_LEADERBOARD_GAME_MODES.map((mode) => ({
                    key: mode,
                    label: t(`ch.short.${mode}`),
                    color: getGameModeConfig(mode).challenge?.color ?? currentTheme.buttonPrimary,
                }))}
                value={gameMode}
                onChange={setGameMode}
            />

            <View style={styles.metaRow}>
                <Text style={[styles.header, { color: currentTheme.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
                    {title}
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

            {(shownBest > 0 || myIndex >= 0) && (
                <LeaderboardMeCard
                    name={myName || "?"}
                    avatarUrl={myIndex >= 0 ? scores[myIndex].avatar_url : null}
                    hint={shownBest > 0 ? t(isDaily ? "ch.yourToday" : "ch.yourBest", { score: shownBest }) : t("ch.notPlayedToday")}
                    place={myIndex >= 0 ? myIndex + 1 : null}
                    placeHint={myIndex >= 0 ? String(scores[myIndex].score) : t("hs.notInTop")}
                    color={color}
                />
            )}

            {loading && <PixelLoader size="large" color={currentTheme.textPrimary} />}

            {!loading && scores.length > 0 && (
                <View style={styles.scoreList}>
                    <LeaderboardPodium
                        onOpen={openProfile}
                        metaColor="#E5E7EB"
                        top={scores.slice(0, 3).map((score, idx) => ({
                            key: `${idx}-${score.player_name}`,
                            name: score.player_name,
                            avatarUrl: score.avatar_url,
                            meta: String(score.score),
                            isMe: isMe(score),
                        }))}
                    />
                    {scores.slice(3).map((score, idx) => (
                        <GlobalScoreRow key={`${idx}-${score.player_name}`} rank={idx + 4} score={score} highlightTop isMe={isMe(score)} accent={color} />
                    ))}
                </View>
            )}

            {!loading && scores.length === 0 && (
                <Text style={[styles.noScoresText, { color: currentTheme.textPrimary }, isMobile && { fontSize: 18 }]}>
                    {t(isDaily ? "ch.noneToday" : "hs.noGlobalScores")}
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
        fontSize: 24,
        fontFamily: "Silkscreen",
        textAlign: "center",
        marginVertical: 20,
    },
});
