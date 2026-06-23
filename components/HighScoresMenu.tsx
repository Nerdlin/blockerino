import { getHighScores, HighScore } from "@/constants/Storage";
import { getGlobalHighScores, GlobalHighScore } from "@/constants/Supabase";
import SimplePopupView from "./SimplePopupView";
import { useCallback, useEffect, useState, useRef } from "react";
import { StyleSheet, Text, View, ActivityIndicator, TextInput, useWindowDimensions } from "react-native";
import StylizedButton from "./StylizedButton";
import { cssColors } from "@/constants/Color";
import { GameModeType, MenuStateType, useAppStateValue, useSetAppState } from "@/hooks/useAppState";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from "@/constants/Theme";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { normalizePlayerName } from "@/constants/Multiplayer";
import { submitGlobalHighScoreOrQueue } from "@/constants/OfflineSync";
import { useShopState } from "@/constants/Shop";
import { CHALLENGE_LEADERBOARD_GAME_MODES, getGameModeConfig, MAIN_LEADERBOARD_GAME_MODES } from "@/constants/GameModes";
import { useLanguage, TranslateVars } from "@/constants/Localization";

const LEADERBOARD_LIMIT = 100;
const LEADERBOARD_REFRESH_MS = 30000;
type LeaderboardPage = "main" | "challenges";

export default function HighScores() {
    const { width, height } = useWindowDimensions();
    const isMobile = width < 600 || height < 700;
    const { t } = useLanguage();
    const { currentTheme } = useTheme();
    const [ setAppState, , popAppState ] = useSetAppState();
    const appState = useAppStateValue();
    const [ highScores, setHighScores ] = useState<HighScore[]>([]);
    const [ globalHighScores, setGlobalHighScores ] = useState<GlobalHighScore[]>([]);
    const [ gameMode, setGameMode ] = useState(GameModeType.Classic);
    const [leaderboardPage, setLeaderboardPage] = useState<LeaderboardPage>("main");
    const [ loading, setLoading ] = useState(false);
    const [ syncing, setSyncing ] = useState(false);
    const [ playerName, setPlayerName ] = useState('');
    
    // Secret states
    const [chaosClicks, setChaosClicks] = useState(0);
    const [secretMessage, setSecretMessage] = useState<string | null>(null);
    const { state: shopState, commit: commitShopState } = useShopState();
    const currentModeConfig = getGameModeConfig(gameMode);
    const localBestScore = highScores[0]?.score ?? 0;
    const isChallengePage = leaderboardPage === "challenges";

    const handleChaosClick = async () => {
        setGameMode(GameModeType.Chaos);
        
        if (shopState.ownedItemIds.includes("music_custom")) return;

        const newClicks = chaosClicks + 1;
        setChaosClicks(newClicks);

        if (newClicks === 12) {
            setSecretMessage("SECRET UNLOCKED: Custom Music URL in Shop!");
            const newState = {
                ...shopState,
                ownedItemIds: [...shopState.ownedItemIds, "music_custom"]
            };
            await commitShopState(newState);
        } else if (newClicks >= 3) {
            setSecretMessage(`${12 - newClicks} clicks remaining...`);
        }
    };

    const handleModeClick = (mode: GameModeType) => {
        if (mode === GameModeType.Chaos) {
            void handleChaosClick();
            return;
        }

        setGameMode(mode);
    };

    const handleOpenChallenges = () => {
        setLeaderboardPage("challenges");
        if (!CHALLENGE_LEADERBOARD_GAME_MODES.includes(gameMode as typeof CHALLENGE_LEADERBOARD_GAME_MODES[number])) {
            setGameMode(GameModeType.DailyPuzzle);
        }
    };

    const handleBackToMainLeaderboards = useCallback(() => {
        setLeaderboardPage("main");
        if (!MAIN_LEADERBOARD_GAME_MODES.includes(gameMode as typeof MAIN_LEADERBOARD_GAME_MODES[number])) {
            setGameMode(GameModeType.Classic);
        }
    }, [gameMode]);

    const syncInProgress = useRef(false);
    const refreshInProgress = useRef(false);
    const isMounted = useRef(true);
    const isActive = appState.current === MenuStateType.HIGH_SCORES;
    const handleBack = useCallback(() => {
        if (leaderboardPage === "challenges") {
            handleBackToMainLeaderboards();
            return;
        }

        popAppState();
    }, [handleBackToMainLeaderboards, leaderboardPage, popAppState]);

    useEscapeKey(handleBack);

    const refreshScores = useCallback(async (showLoader: boolean = false) => {
        if (refreshInProgress.current) return;
        refreshInProgress.current = true;

        if (showLoader) {
            setLoading(true);
        }

        try {
            const [localScores, remoteScores] = await Promise.all([
                getHighScores(gameMode, true, true, LEADERBOARD_LIMIT),
                getGlobalHighScores(gameMode, LEADERBOARD_LIMIT)
            ]);

            if (!isMounted.current) return;

            setHighScores(localScores);
            setGlobalHighScores(remoteScores);
        } finally {
            refreshInProgress.current = false;
            if (showLoader && isMounted.current) {
                setLoading(false);
            }
        }
    }, [gameMode]);

    useEffect(() => {
        isMounted.current = true;

        return () => {
            isMounted.current = false;
        };
    }, []);

    useEffect(() => {
        AsyncStorage.getItem('PLAYER_NAME').then((val) => {
            if (val) {
                setPlayerName(val);
            }
        });
    }, []);

    const handlePlayerNameChange = (name: string) => {
        setPlayerName(name);
    };

    const handlePlayerNameBlur = async () => {
        if (syncInProgress.current) return;
        syncInProgress.current = true;
        
        try {
            const finalName = normalizePlayerName(playerName);
            
            if (!finalName) {
                await AsyncStorage.removeItem('PLAYER_NAME');
                return;
            }

            setPlayerName(finalName);
            await AsyncStorage.setItem('PLAYER_NAME', finalName);
            
            // Auto-sync best local score if they have one
            if (highScores.length > 0) {
                setSyncing(true);
                const bestScore = highScores[0].score;
                await submitGlobalHighScoreOrQueue(finalName, bestScore, gameMode);
                setSyncing(false);
                
                await refreshScores(true);
            }
        } catch (error) {
            console.error('Error syncing score:', error);
            setSyncing(false);
            setLoading(false);
        } finally {
            syncInProgress.current = false;
        }
    };

    useEffect(() => {
        if (!isActive) {
            return;
        }

        refreshScores(true);
        const timer = setInterval(() => refreshScores(false), LEADERBOARD_REFRESH_MS);

        return () => {
            clearInterval(timer);
        };
    }, [isActive, refreshScores]);

    const hasScores = globalHighScores.length > 0;

    return <SimplePopupView style={[{justifyContent: 'flex-start', backgroundColor: currentTheme.menuBackground}]}>
        <StylizedButton text={t("hs.back")} onClick={handleBack} backgroundColor={cssColors.spaceGray}></StylizedButton>

        <View style={styles.nicknameContainer}>
            <Text style={[styles.subHeader, { color: currentTheme.textSecondary, fontSize: 18, marginBottom: 5 }, isMobile && { fontSize: 14 }]}>
                {t("hs.yourNickname")}
            </Text>
            <TextInput
                style={[styles.nicknameInput, {
                    color: currentTheme.textPrimary,
                    borderColor: currentTheme.textSecondary,
                    backgroundColor: 'rgba(0, 0, 0, 0.4)'
                }, isMobile && { fontSize: 16, padding: 6 }]}
                value={playerName}
                onChangeText={handlePlayerNameChange}
                onBlur={handlePlayerNameBlur}
                onSubmitEditing={handlePlayerNameBlur}
                placeholder={t("hs.enterNickname")}
                placeholderTextColor={currentTheme.textSecondary}
                maxLength={20}
            />
            {syncing && (
                <Text style={{ fontFamily: 'Silkscreen', fontSize: 12, color: currentTheme.textSecondary, marginTop: 5 }}>
                    {t("hs.syncingBest")}
                </Text>
            )}
        </View>

        <View style={styles.modeHeaderRow}>
            <Text style={[styles.subHeader, styles.modeHeaderText, { color: currentTheme.textSecondary }, isMobile && { fontSize: 18 }]}>
                {isChallengePage ? t("hs.challengeLeaderboards") : t("hs.selectMode")}
            </Text>
        </View>
        <View style={styles.modeRow}>
            {(isChallengePage ? CHALLENGE_LEADERBOARD_GAME_MODES : MAIN_LEADERBOARD_GAME_MODES).map((mode) => {
                const config = getGameModeConfig(mode);
                const isSelected = gameMode === mode;
                const modeColor = config.challenge?.color ?? (mode === GameModeType.Chaos ? cssColors.pitchBlack : currentTheme.buttonPrimary);

                return (
                    <StylizedButton
                        key={mode}
                        text={config.shortTitle}
                        onClick={() => handleModeClick(mode)}
                        backgroundColor={isSelected ? modeColor : cssColors.spaceGray}
                        borderColor={isSelected && mode === GameModeType.Chaos ? "white" : undefined}
                        style={styles.modeButton}
                        textStyle={isMobile && styles.mobileButtonText}
                    />
                );
            })}
            {!isChallengePage && (
                <StylizedButton
                    text={t("hs.challenges")}
                    onClick={handleOpenChallenges}
                    backgroundColor={cssColors.spaceGray}
                    style={[styles.modeButton, styles.challengeEntryButton]}
                    textStyle={isMobile && styles.mobileButtonText}
                />
            )}
        </View>
        {secretMessage && (
            <Text style={{ fontFamily: 'Silkscreen', fontSize: 12, color: '#FFD700', marginTop: 5, textAlign: 'center' }}>
                {secretMessage}
            </Text>
        )}
        <Text style={[styles.header, { color: currentTheme.textPrimary }, isMobile && { fontSize: 22 }]}>
            {t("hs.leaderboardTitle", { mode: currentModeConfig.leaderboardTitle })}
        </Text>
        <View style={styles.leaderboardMetaRow}>
            <Text style={[styles.subHeader, styles.leaderboardSortText, { color: currentTheme.textSecondary }, isMobile && { fontSize: 16 }]}>
                {t("hs.localBest", { score: localBestScore })}
            </Text>
            <StylizedButton
                text={loading ? "..." : t("hs.refresh")}
                onClick={() => refreshScores(true)}
                backgroundColor={currentTheme.buttonSecondary}
                disabled={loading}
                style={styles.refreshLeaderboardButton}
                textStyle={styles.refreshLeaderboardButtonText}
            />
        </View>

        {loading && <ActivityIndicator size="large" color={currentTheme.textPrimary} />}

        {!loading && hasScores && (
            <View style={styles.scoreList}>
                {globalHighScores.map((score, idx) => {
                    return <GlobalScore key={score.id || idx} rank={idx + 1} score={score}/>
                })}
            </View>
        )}

        { !hasScores && !loading &&
            <>
                <Text style={[styles.noScoresText, { color: currentTheme.textPrimary }, isMobile && { fontSize: 20 }]}>
                    {t("hs.noGlobalScores")}
                </Text>
                <StylizedButton text={t("hs.play", { mode: currentModeConfig.shortTitle })} onClick={() => {
                    setAppState(gameMode)
                }} backgroundColor={currentModeConfig.challenge?.color ?? currentTheme.buttonPrimary}></StylizedButton>
            </>
        }
    </SimplePopupView>
}

function GlobalScore({score, rank}: {score: GlobalHighScore, rank: number}) {
    const { t } = useLanguage();
    const { currentTheme } = useTheme();
    const { width, height } = useWindowDimensions();
    const isMobile = width < 600 || height < 700;
    return (
        <View style={[styles.scoreRow, isMobile && styles.mobileScoreRow]}>
            <Text style={[styles.scoreRankText, { color: currentTheme.textPrimary }, isMobile && styles.mobileScoreRankText]}>
                #{rank}
            </Text>
            <View style={styles.scoreNameColumn}>
                <Text style={[styles.scoreNameText, { color: currentTheme.textPrimary }, isMobile && styles.mobileScoreNameText]} numberOfLines={1}>
                    {score.player_name}
                </Text>
                <Text style={[styles.scoreTimeText, { color: currentTheme.textSecondary }, isMobile && { fontSize: 10 }]} numberOfLines={1}>
                    {score.created_at ? createTimeAgoString(new Date(score.created_at).getTime(), t) : t("hs.unknownTime")}
                </Text>
            </View>
            <Text style={[styles.scoreNumberText, { color: currentTheme.textPrimary }, isMobile && styles.mobileScoreNumberText]} numberOfLines={1} adjustsFontSizeToFit>
                {score.score}
            </Text>
        </View>
    );
}

function createTimeAgoString(date: number, t: (key: string, vars?: TranslateVars) => string): string {
    const now = new Date();
    const seconds = Math.round((now.getTime() - date) / 1000);
    const minutes = Math.round(seconds / 60);
    const hours = Math.round(minutes / 60);
    const days = Math.round(hours / 24);
    const months = Math.round(days / 30);
    const years = Math.round(days / 365);

    if (seconds < 60) {
      return seconds <= 0 ? t("hs.timeNow") : t("hs.secondsAgo", { count: seconds });
    } else if (minutes < 60) {
      return t("hs.minutesAgo", { count: minutes });
    } else if (hours < 24) {
      return t("hs.hoursAgo", { count: hours });
    } else if (days < 30) {
      return t("hs.daysAgo", { count: days });
    } else if (months < 12) {
      return t("hs.monthsAgo", { count: months });
    } else {
      return t("hs.yearsAgo", { count: years });
    }
  }

const styles = StyleSheet.create({
    noScoresText: {
        color: 'white',
        fontSize: 30,
        fontFamily: 'Silkscreen',
        textAlign: 'center',
        marginBottom: 20
    },
    scoreTimeText: {
        color: 'rgb(150, 150, 150)',
        fontSize: 11,
        fontFamily: 'Silkscreen'
    },
    header: {
        color: 'white',
        fontSize: 30,
        fontFamily: 'Silkscreen'
    },
    subHeader: {
        color: 'rgb(100, 100, 100)',
        fontSize: 24,
        fontFamily: 'Silkscreen'
    },
    nicknameContainer: {
        width: '80%',
        alignItems: 'center',
        marginVertical: 15,
        gap: 5
    },
    nicknameInput: {
        width: '100%',
        fontSize: 20,
        fontFamily: 'Silkscreen',
        padding: 10,
        borderWidth: 2,
        borderRadius: 5,
        textAlign: 'center',
    },
    modeRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        justifyContent: 'center',
        width: '90%',
    },
    modeHeaderRow: {
        width: '90%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 4,
    },
    modeHeaderText: {
        flex: 1,
        textAlign: 'center',
    },
    modeButton: {
        minWidth: 112,
        maxWidth: 150,
        flexGrow: 1,
        flexBasis: 112,
    },
    challengeEntryButton: {
        maxWidth: 180,
    },
    leaderboardMetaRow: {
        width: '94%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        marginTop: 2,
        marginBottom: 6,
    },
    leaderboardSortText: {
        flex: 1,
        marginBottom: 0,
    },
    refreshLeaderboardButton: {
        minWidth: 92,
        minHeight: 32,
        height: 32,
        paddingHorizontal: 8,
        paddingVertical: 4,
        margin: 0,
    },
    refreshLeaderboardButtonText: {
        fontSize: 10,
    },
    mobileButtonText: {
        fontSize: 14,
    },
    scoreList: {
        width: '94%',
        gap: 6,
        marginTop: 4,
    },
    scoreRow: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 7,
        paddingHorizontal: 10,
        borderRadius: 6,
        backgroundColor: 'rgba(255,255,255,0.04)',
        minHeight: 48,
    },
    mobileScoreRow: {
        gap: 6,
        paddingHorizontal: 7,
        minHeight: 44,
    },
    scoreRankText: {
        width: 52,
        fontSize: 20,
        fontFamily: 'Silkscreen',
        textAlign: 'left',
    },
    mobileScoreRankText: {
        width: 38,
        fontSize: 15,
    },
    scoreNameColumn: {
        flex: 1,
        minWidth: 0,
    },
    scoreNameText: {
        fontSize: 18,
        fontFamily: 'Silkscreen',
    },
    mobileScoreNameText: {
        fontSize: 14,
    },
    scoreNumberText: {
        width: 110,
        fontSize: 18,
        fontFamily: 'Silkscreen',
        textAlign: 'right',
    },
    mobileScoreNumberText: {
        width: 78,
        fontSize: 14,
    },
});
