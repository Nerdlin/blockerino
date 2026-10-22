import { getHighScores, HighScore } from "@/constants/Storage";
import { getGlobalHighScores, GlobalHighScore } from "@/constants/Supabase";
import SimplePopupView from "./SimplePopupView";
import { useCallback, useEffect, useState, useRef } from "react";
import { StyleSheet, Text, View, Pressable, TextInput, useWindowDimensions } from "react-native";
import PixelLoader from "@/components/PixelLoader";
import StylizedButton from "./StylizedButton";
import { cssColors } from "@/constants/Color";
import { GameModeType, MenuStateType, useAppStateValue, useSetAppState } from "@/hooks/useAppState";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from "@/constants/Theme";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { normalizePlayerName } from "@/constants/Multiplayer";
import { submitGlobalHighScoreOrQueue } from "@/constants/OfflineSync";
import { useShopState } from "@/constants/Shop";
import { getGameModeConfig, MAIN_LEADERBOARD_GAME_MODES } from "@/constants/GameModes";
import { useLanguage } from "@/constants/Localization";
import { syncLocalHighScores } from "@/constants/LocalScoreSync";
import GlobalScoreRow from "./GlobalScoreRow";
import SegmentedControl, { type SegmentItem } from "./SegmentedControl";
import UiIcon from "./UiIcon";
import { getFriendsSeasonLeaderboard, getSeasonBoard, getSeasonEndsAt, getSeasonLeaderboard } from "@/constants/SeasonScores";
import { useAccountIdentity } from "@/hooks/useAccountIdentity";

const LEADERBOARD_LIMIT = 100;
const LEADERBOARD_REFRESH_MS = 30000;

export default function HighScores() {
    const { width, height } = useWindowDimensions();
    const isMobile = width < 600 || height < 700;
    const { t } = useLanguage();
    const { currentTheme } = useTheme();
    const [ setAppState, appendAppState, popAppState ] = useSetAppState();
    const appState = useAppStateValue();
    const [ highScores, setHighScores ] = useState<HighScore[]>([]);
    const [ globalHighScores, setGlobalHighScores ] = useState<GlobalHighScore[]>([]);
    const [ gameMode, setGameMode ] = useState(GameModeType.Classic);
    const [ loading, setLoading ] = useState(false);
    const [ syncing, setSyncing ] = useState(false);
    const [ playerName, setPlayerName ] = useState('');
    
    // Secret states
    const [chaosClicks, setChaosClicks] = useState(0);
    const [secretMessage, setSecretMessage] = useState<string | null>(null);
    const { state: shopState, commit: commitShopState } = useShopState();
    const currentModeConfig = getGameModeConfig(gameMode);
    const localBestScore = highScores[0]?.score ?? 0;
    const [scope, setScope] = useState<"season" | "alltime" | "friends">("season");
    const { checked: authChecked, signedIn } = useAccountIdentity();
    const seasonBoard = getSeasonBoard(gameMode);
    const showSeason = scope === "season" && seasonBoard !== null;
    const showFriends = scope === "friends" && seasonBoard !== null && signedIn;
    const seasonDaysLeft = Math.ceil((getSeasonEndsAt().getTime() - Date.now()) / 86400000);

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

    const syncInProgress = useRef(false);
    const refreshInProgress = useRef(false);
    const isMounted = useRef(true);
    const isActive = appState.current === MenuStateType.HIGH_SCORES;
    const handleBack = useCallback(() => {
        popAppState();
    }, [popAppState]);

    useEscapeKey(handleBack);

    const refreshScores = useCallback(async (showLoader: boolean = false) => {
        if (refreshInProgress.current) return;
        refreshInProgress.current = true;

        if (showLoader) {
            setLoading(true);
        }

        try {
            await syncLocalHighScores();
            const [localScores, remoteScores] = await Promise.all([
                getHighScores(gameMode, true, true, LEADERBOARD_LIMIT),
                showFriends && seasonBoard
                    ? getFriendsSeasonLeaderboard(seasonBoard)
                    : showSeason && seasonBoard
                        ? getSeasonLeaderboard(seasonBoard, LEADERBOARD_LIMIT)
                        : getGlobalHighScores(gameMode, LEADERBOARD_LIMIT)
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
    }, [gameMode, showSeason, showFriends, seasonBoard]);

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

    const modeItems: SegmentItem<GameModeType>[] = MAIN_LEADERBOARD_GAME_MODES.map((mode) => ({
        key: mode,
        label: getGameModeConfig(mode).shortTitle,
        color: mode === GameModeType.Chaos ? "#7C3AED" : getGameModeConfig(mode).challenge?.color ?? currentTheme.buttonPrimary,
    }));
    const scopeItems: SegmentItem<"season" | "friends" | "alltime">[] = [
        { key: "season", label: t("hs.scopeSeason") },
        ...(signedIn ? [{ key: "friends" as const, label: t("hs.scopeFriends") }] : []),
        { key: "alltime", label: t("hs.scopeAllTime") },
    ];

    return <SimplePopupView style={[{justifyContent: 'flex-start', backgroundColor: currentTheme.menuBackground}]}>
        <View style={styles.topBar}>
            <StylizedButton text={t("hs.back")} onClick={handleBack} backgroundColor={cssColors.spaceGray} style={styles.backButton}></StylizedButton>
            <Pressable
                onPress={() => refreshScores(true)}
                disabled={loading}
                accessibilityLabel={t("hs.refresh")}
                style={[styles.refreshIcon, loading && { opacity: 0.5 }]}
            >
                {loading ? <PixelLoader size="small" color={currentTheme.textPrimary} /> : <UiIcon name="refresh" size={18} />}
            </Pressable>
        </View>

        <SegmentedControl items={modeItems} value={gameMode} onChange={handleModeClick} />
        {seasonBoard && (
            <View style={styles.scopeSpacing}>
                <SegmentedControl items={scopeItems} value={scope} onChange={setScope} small />
            </View>
        )}

        <View style={styles.infoRow}>
            <Text style={[styles.seasonEndsText, { color: currentTheme.textSecondary }]}>
                {showSeason || showFriends
                    ? (seasonDaysLeft <= 1 ? t("hs.seasonEndsToday") : t("hs.seasonEndsIn", { days: seasonDaysLeft }))
                    : ""}
            </Text>
            <Pressable onPress={() => appendAppState(MenuStateType.SEASON_RESULTS)}>
                <Text style={[styles.seasonLink, { color: currentTheme.accent }]}>{t("hs.pastSeasonShort")}</Text>
            </Pressable>
        </View>
        {secretMessage && (
            <Text style={{ fontFamily: 'Silkscreen', fontSize: 12, color: '#FFD700', marginTop: 5, textAlign: 'center' }}>
                {secretMessage}
            </Text>
        )}
        {localBestScore > 0 && (
            <View style={[styles.bestCard, { borderColor: currentTheme.accent }]}>
                <Text style={[styles.bestText, { color: currentTheme.textPrimary }]}>{t("hs.localBest", { score: localBestScore })}</Text>
            </View>
        )}

        {loading && <PixelLoader size="large" color={currentTheme.textPrimary} />}

        {!loading && hasScores && (
            <View style={styles.scoreList}>
                {globalHighScores.map((score, idx) => {
                    return <GlobalScoreRow key={score.id || idx} rank={idx + 1} score={score} highlightTop/>
                })}
            </View>
        )}

        {authChecked && !signedIn && (
            <View style={styles.guestNickname}>
                <Text style={[styles.guestNicknameLabel, { color: currentTheme.textSecondary }]}>{t("hs.yourNickname")}</Text>
                <TextInput
                    style={[styles.guestNicknameInput, {
                        color: currentTheme.textPrimary,
                        borderColor: currentTheme.textSecondary,
                        backgroundColor: 'rgba(0, 0, 0, 0.4)'
                    }]}
                    value={playerName}
                    onChangeText={handlePlayerNameChange}
                    onBlur={handlePlayerNameBlur}
                    onSubmitEditing={handlePlayerNameBlur}
                    placeholder={t("hs.enterNickname")}
                    placeholderTextColor={currentTheme.textSecondary}
                    maxLength={20}
                />
                {syncing && (
                    <Text style={{ fontFamily: 'Silkscreen', fontSize: 11, color: currentTheme.textSecondary }}>
                        {t("hs.syncingBest")}
                    </Text>
                )}
            </View>
        )}

        { !hasScores && !loading &&
            <>
                <Text style={[styles.noScoresText, { color: currentTheme.textPrimary }, isMobile && { fontSize: 20 }]}>
                    {showFriends ? t("hs.noFriendsScores") : t("hs.noGlobalScores")}
                </Text>
                <StylizedButton text={t("hs.play", { mode: currentModeConfig.shortTitle })} onClick={() => {
                    setAppState(gameMode)
                }} backgroundColor={currentModeConfig.challenge?.color ?? currentTheme.buttonPrimary}></StylizedButton>
            </>
        }
    </SimplePopupView>
}

const styles = StyleSheet.create({
    topBar: {
        width: '92%',
        maxWidth: 420,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    backButton: {
        minWidth: 100,
    },
    refreshIcon: {
        width: 44,
        height: 44,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.25)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    scopeSpacing: {
        width: '100%',
        alignItems: 'center',
        marginTop: 8,
    },
    infoRow: {
        width: '92%',
        maxWidth: 420,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 10,
        marginBottom: 6,
    },
    seasonLink: {
        fontFamily: 'Silkscreen',
        fontSize: 11,
    },
    bestCard: {
        width: '92%',
        maxWidth: 420,
        borderWidth: 1.5,
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 12,
        marginTop: 4,
        marginBottom: 6,
    },
    bestText: {
        fontFamily: 'Silkscreen',
        fontSize: 12,
        textAlign: 'center',
    },
    guestNickname: {
        width: '92%',
        maxWidth: 420,
        alignItems: 'center',
        marginTop: 16,
        gap: 6,
    },
    guestNicknameLabel: {
        fontFamily: 'Silkscreen',
        fontSize: 11,
    },
    guestNicknameInput: {
        width: '100%',
        fontSize: 14,
        fontFamily: 'Silkscreen',
        padding: 8,
        borderWidth: 2,
        borderRadius: 5,
        textAlign: 'center',
    },
    noScoresText: {
        color: 'white',
        fontSize: 30,
        fontFamily: 'Silkscreen',
        textAlign: 'center',
        marginBottom: 20
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
    scopeRow: {
        flexDirection: 'row',
        gap: 10,
        justifyContent: 'center',
        marginTop: 8,
    },
    scopeButton: {
        minWidth: 112,
        minHeight: 32,
        height: 32,
        paddingHorizontal: 8,
        paddingVertical: 4,
        margin: 0,
    },
    scopeButtonText: {
        fontSize: 10,
    },
    seasonEndsText: {
        fontFamily: 'Silkscreen',
        fontSize: 11,
        marginTop: 6,
        textAlign: 'center',
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
});
