import React, { useEffect, useRef, useState } from "react";
import AnimatedNumber from "./AnimatedNumber";
import FadeInView from "./FadeInView";
import { StyleSheet, Text, View, Platform, TextInput } from "react-native";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import { GameModeType, MenuStateType, useSetAppState } from "@/hooks/useAppState";
import { supabase } from "@/constants/Supabase";
import { setProfileAuthIntent } from "@/constants/ProfileIntent";
import { useSoundSettings } from "@/constants/Sound";
import {useTheme, ThemeType, opaqueColor } from "@/constants/Theme";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizePlayerName } from "@/constants/Multiplayer";
import { submitGlobalHighScoreOrQueue } from "@/constants/OfflineSync";
import { recordSeasonScore } from "@/constants/SeasonScores";
import { recordChallengeResult } from "@/constants/ChallengeProgress";
import { useShopState } from "@/constants/Shop";
import { GameOverReason } from "@/constants/GameModes";
import { useLanguage } from "@/constants/Localization";
import { track } from "@/constants/Analytics";
import { getHighScores } from "@/constants/Storage";
import ShareCard, { SHARE_CARD_WIDTH } from "./ShareCard";
import { buildShareText, shareScoreCard } from "@/constants/ShareScore";
import { getAccountSession } from '@/constants/AccountSession';
import { getMedalForScore, getMedals, getNextMedal } from '@/constants/RunGoals';
import { MedalBadge } from './game/RunGoalBar';

const PLAYER_NAME_KEY = 'PLAYER_NAME';
const GAMES_FINISHED_KEY = 'GAMES_FINISHED';
// Guests are asked to create an account only after a few games, never straight after the first one.
const ACCOUNT_PROMPT_AFTER_GAMES = 3;

export default function GameOverModal({ score, gameMode, reason }: { score: number, gameMode: GameModeType, reason?: GameOverReason | null }) {
    const [setAppState, appendAppState] = useSetAppState();
    const { playSfx } = useSoundSettings();
    const { currentTheme } = useTheme();
    const { t } = useLanguage();
    const scale = useSharedValue(1);
    const [playerName, setPlayerName] = useState('');
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'queued' | 'failed' | 'needs_name'>('idle');
    const [coinsAwarded, setCoinsAwarded] = useState(0);
    const [signedIn, setSignedIn] = useState(true);
    const [bestScore, setBestScore] = useState<number | null>(null);
    const [finishedCount, setFinishedCount] = useState(0);
    const shareCardRef = useRef<View>(null);
    const [shareNote, setShareNote] = useState<string | null>(null);
    const [sharing, setSharing] = useState(false);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                // The list already contains this run once the game saved it, so "score >= best" means a record.
                const best = (await getHighScores(gameMode, true, true, 1))[0]?.score ?? 0;
                if (active) setBestScore(best);
                const previous = Number(await AsyncStorage.getItem(GAMES_FINISHED_KEY)) || 0;
                await AsyncStorage.setItem(GAMES_FINISHED_KEY, String(previous + 1));
                if (active) setFinishedCount(previous + 1);
            } catch {
                // The record line is a nicety; the screen works without it.
            }
        })();
        return () => { active = false; };
    }, [gameMode]);

    useEffect(() => {
        let active = true;
        getAccountSession()
            .then(({ data }) => { if (active) setSignedIn(Boolean(data.session)); })
            .catch(() => { if (active) setSignedIn(true); });
        return () => { active = false; };
    }, []);

    const openAccountScreen = (intent: 'login' | 'register') => {
        setProfileAuthIntent(intent);
        appendAppState(MenuStateType.PROFILE);
    };
    const coinsAwardedRef = useRef(false);
    const { awardCoins } = useShopState();

    useEffect(() => {
        playSfx('gameOver');

        // Пульсирующая анимация для текста "Game Over"
        scale.value = withRepeat(
            withSequence(
                withTiming(1.1, { duration: 700 }),
                withTiming(1, { duration: 700 })
            ),
            -1,
            true
        );
    }, [playSfx, scale]);

    useEffect(() => {
        // The modal mounts once per finished game.
        track("game_over", { mode: gameMode, score, reason: reason ?? null });
        // challenge stars, the Daily Puzzle streak and the board of the puzzle day
        void recordChallengeResult(gameMode, score);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (coinsAwardedRef.current) return;
        coinsAwardedRef.current = true;
        // the run's medal pays its coins on top of the usual ones
        awardCoins(score, getMedalForScore(gameMode, score)?.coins ?? 0).then(setCoinsAwarded);
    }, [awardCoins, score]);

    const doSubmit = React.useCallback(async (nameToSubmit: string) => {
        const normalizedName = normalizePlayerName(nameToSubmit);
        if (!normalizedName) {
            setSubmitStatus('needs_name');
            return;
        }

        setSubmitStatus('submitting');
        setPlayerName(normalizedName);
        try {
            await AsyncStorage.setItem(PLAYER_NAME_KEY, normalizedName);
            const result = await submitGlobalHighScoreOrQueue(normalizedName, score, gameMode);
            void recordSeasonScore(gameMode, score);
            if (result === 'synced') {
                setSubmitStatus('success');
            } else if (result === 'queued') {
                setSubmitStatus('queued');
            } else {
                setSubmitStatus('failed');
            }
        } catch (err) {
            console.error('Error submitting high score:', err);
            setSubmitStatus('failed');
        }
    }, [score, gameMode]);

    useEffect(() => {
        const checkAndSubmit = async () => {
            try {
                let savedName = await AsyncStorage.getItem(PLAYER_NAME_KEY);
                const name = savedName ? normalizePlayerName(savedName) : '';
                setPlayerName(name);
                
                if (name !== '') {
                    // Auto submit for returning players
                    await doSubmit(name);
                }
            } catch (err) {
                console.error(err);
            }
        };

        checkAndSubmit();
    }, [score, gameMode, doSubmit]);

    const handleManualSubmit = () => {
        doSubmit(playerName);
    };

    const animatedTextStyle = useAnimatedStyle(() => {
        return {
            transform: [{ scale: scale.value }]
        };
    });

    const canEditNickname = submitStatus === 'idle' || submitStatus === 'needs_name';

    const handlePlayAgain = () => {
        if (submitStatus === 'idle' && normalizePlayerName(playerName)) {
            doSubmit(playerName);
        }
        playSfx('menuClick');
        // Сбрасываем состояние до главного меню, а затем запускаем новую игру
        setTimeout(() => {
            setAppState(MenuStateType.MENU); // Сбрасываем состояние до главного меню
            setTimeout(() => {
                appendAppState(gameMode); // Запускаем новую игру
            }, 50);
        }, 50);
    };

    const handleMainMenu = () => {
        if (submitStatus === 'idle' && normalizePlayerName(playerName)) {
            doSubmit(playerName);
        }
        playSfx('menuClick');
        setAppState(MenuStateType.MENU);
    };

    const modeTitle = t(`mode.${gameMode}`);
    const medal = getMedalForScore(gameMode, score);
    const nextMedal = getNextMedal(gameMode, score);
    const isRecord = bestScore !== null && score > 0 && score >= bestScore;
    const handleShare = async () => {
        if (sharing) return;
        playSfx('menuClick');
        setSharing(true);
        setShareNote(null);
        const result = await shareScoreCard(shareCardRef, buildShareText(score, modeTitle, t("share.text")), t("share.dialog"));
        setSharing(false);
        track("share_score", { mode: gameMode, score, result });
        if (result === 'copied') setShareNote(t("share.copied"));
        else if (result === 'failed') setShareNote(t("share.failed"));
    };

    const recordLine = bestScore === null || score <= 0 ? null : score >= bestScore ? (
        <Text style={[styles.coinsText, { color: '#FFD700', marginBottom: 14 }]}>{t("over.newRecord")}</Text>
    ) : (
        <Text style={[styles.coinsText, { color: currentTheme.textSecondary, marginBottom: 14 }]}>
            {t("over.toRecord", { points: bestScore - score, best: bestScore })}
        </Text>
    );

    const reasonKey = reason === "time" ? "over.reason.time" : reason === "move_limit" ? "over.reason.moveLimit" : "over.reason.noRoom";
    const medals = getMedals(gameMode);
    const prevMedalScore = medal ? medal.score : 0;
    const medalProgress = nextMedal ? Math.max(0, Math.min(1, (score - prevMedalScore) / Math.max(1, nextMedal.score - prevMedalScore))) : 1;

    return (
        <>
        <SimplePopupView style={[{ backgroundColor: opaqueColor(currentTheme.menuBackground) }]}>
            <Animated.Text
                entering={FadeIn.duration(600)}
                style={[styles.gameOverText, { color: currentTheme.id === ThemeType.BLUE ? 'rgb(0, 153, 255)' : currentTheme.buttonPrimary }, animatedTextStyle]}
            >
                {t("over.gameOver")}
            </Animated.Text>
            <Text style={[styles.reasonText, { color: currentTheme.textSecondary }]}>{t(reasonKey)}</Text>

            <View style={[styles.scoreCard, isRecord && styles.scoreCardRecord]}>
                <Text style={[styles.scoreLabel, { color: currentTheme.textSecondary }]}>{t("over.yourScore")}</Text>
                <AnimatedNumber
                    value={score}
                    duration={900}
                    style={[styles.scoreValue, { color: currentTheme.id === ThemeType.BLUE ? 'rgb(255, 204, 0)' : currentTheme.accent }]}
                />
                {isRecord ? (
                    <FadeInView pop delay={900}>
                        <Text style={styles.recordBadge}>{t("over.newRecord")}</Text>
                    </FadeInView>
                ) : bestScore !== null && score > 0 ? (
                    <Text style={[styles.toRecord, { color: currentTheme.textSecondary }]}>{t("over.toRecord", { points: bestScore - score, best: bestScore })}</Text>
                ) : null}
            </View>

            {medals.length > 0 && (
                <View style={styles.medalCard}>
                    <View style={styles.medalHead}>
                        <View style={styles.medalIcons}>
                            {medals.map((m) => (
                                <View key={m.id} style={{ opacity: medal && m.score <= medal.score ? 1 : 0.25 }}>
                                    <MedalBadge kind={m.id} size={22} />
                                </View>
                            ))}
                        </View>
                        <Text style={[styles.medalTitle, { color: medal ? '#FFD700' : currentTheme.textSecondary }]}>
                            {medal ? t("goals.medalEarned", { medal: t(`goals.${medal.id}`), coins: medal.coins }) : t("over.noMedal")}
                        </Text>
                    </View>
                    {nextMedal && (
                        <>
                            <View style={styles.medalTrack}>
                                <View style={[styles.medalFill, { width: `${Math.round(medalProgress * 100)}%` }]} />
                            </View>
                            <Text style={styles.medalNext}>{t("goals.toNextMedal", { medal: t(`goals.${nextMedal.id}`), points: nextMedal.score - score })}</Text>
                        </>
                    )}
                </View>
            )}

            {coinsAwarded > 0 && (
                <FadeInView pop delay={700}>
                    <View style={styles.coinsPill}>
                        <Text style={[styles.coinsText, { color: '#FFD700' }]}>{t("over.coinsAwarded", { coins: coinsAwarded })}</Text>
                    </View>
                </FadeInView>
            )}

            <View style={styles.buttonContainer}>
                <StylizedButton
                    text={t("over.playAgain")}
                    onClick={handlePlayAgain}
                    backgroundColor={currentTheme.id === ThemeType.BLUE ? 'rgb(0, 153, 51)' : currentTheme.buttonPrimary}
                    style={{ minWidth: 240, height: 58 }}
                    textStyle={{ fontSize: 20 }}
                />
                <View style={styles.secondaryRow}>
                    <StylizedButton
                        text={t("over.mainMenu")}
                        onClick={handleMainMenu}
                        backgroundColor={currentTheme.buttonSecondary}
                        style={styles.secondaryButton}
                        textStyle={{ fontSize: 14 }}
                    />
                    {score > 0 && (
                        <StylizedButton
                            text={t("share.button")}
                            onClick={handleShare}
                            disabled={sharing}
                            backgroundColor="rgb(70, 70, 90)"
                            style={styles.secondaryButton}
                            textStyle={{ fontSize: 14 }}
                        />
                    )}
                </View>
            </View>

            {shareNote && <Text style={[styles.statusText, { color: currentTheme.textSecondary }]}>{shareNote}</Text>}

            <View style={styles.statusContainer}>
                {canEditNickname && (
                    <View style={{ width: '100%', alignItems: 'center', gap: 8 }}>
                        <Text style={[styles.messageText, { color: currentTheme.textSecondary, marginBottom: 0, paddingHorizontal: 0, fontSize: 12 }]}>
                            {t("over.enterNickname")}
                        </Text>
                        <View style={styles.nickRow}>
                            <TextInput
                                style={[styles.nicknameInput, {
                                    flex: 1,
                                    color: currentTheme.textPrimary,
                                    borderColor: submitStatus === 'needs_name' ? 'rgb(255, 80, 80)' : currentTheme.textSecondary,
                                    backgroundColor: 'rgba(0, 0, 0, 0.4)'
                                }]}
                                value={playerName}
                                onChangeText={(name) => {
                                    setPlayerName(name);
                                    if (submitStatus === 'needs_name' && normalizePlayerName(name)) {
                                        setSubmitStatus('idle');
                                    }
                                }}
                                placeholder={t("over.nicknamePlaceholder")}
                                placeholderTextColor="gray"
                                maxLength={15}
                            />
                            <StylizedButton
                                text={t("over.saveScore")}
                                onClick={handleManualSubmit}
                                backgroundColor={currentTheme.buttonPrimary}
                                style={{ minWidth: 0, height: 44, paddingHorizontal: 12, margin: 0 }}
                                textStyle={{ fontSize: 12 }}
                            />
                        </View>
                        {!signedIn && finishedCount >= ACCOUNT_PROMPT_AFTER_GAMES && (
                            <View style={{ width: '100%', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                <Text style={[styles.messageText, { color: currentTheme.textSecondary, paddingHorizontal: 0, fontSize: 11 }]}>
                                    {t("over.accountPrompt")}
                                </Text>
                                <View style={{ flexDirection: 'row', gap: 8, width: '100%', justifyContent: 'center' }}>
                                    <StylizedButton text={t("over.createAccount")} onClick={() => openAccountScreen('register')} backgroundColor={currentTheme.accent} style={{ flex: 1, minWidth: 0, minHeight: 38, paddingHorizontal: 4, margin: 0 }} textStyle={{ fontSize: 11 }} />
                                    <StylizedButton text={t("over.haveAccount")} onClick={() => openAccountScreen('login')} backgroundColor="rgb(90,90,90)" style={{ flex: 1, minWidth: 0, minHeight: 38, paddingHorizontal: 4, margin: 0 }} textStyle={{ fontSize: 11 }} />
                                </View>
                            </View>
                        )}
                    </View>
                )}
                {submitStatus === 'submitting' && <Text style={[styles.statusText, { color: currentTheme.textSecondary }]}>{t("over.saving")}</Text>}
                {submitStatus === 'success' && <Text style={[styles.statusText, { color: 'rgb(0, 200, 80)' }]}>{t("over.saved", { name: playerName })}</Text>}
                {submitStatus === 'queued' && <Text style={[styles.statusText, { color: currentTheme.accent }]}>{t("over.savedOffline")}</Text>}
                {submitStatus === 'failed' && <Text style={[styles.statusText, { color: 'rgb(255, 80, 80)' }]}>{t("over.syncFailed")}</Text>}
                {submitStatus === 'needs_name' && <Text style={[styles.statusText, { color: 'rgb(255, 80, 80)' }]}>{t("over.needName")}</Text>}
            </View>
        </SimplePopupView>
        {/* Drawn off screen: this is the picture that gets shared. */}
        <View pointerEvents="none" style={{ position: 'absolute', left: -(SHARE_CARD_WIDTH + 80), top: 0 }}>
            <ShareCard
                ref={shareCardRef}
                score={score}
                modeTitle={modeTitle}
                playerName={playerName}
                isRecord={isRecord}
                recordText={t("over.newRecord")}
                tagline={t("share.tagline")}
            />
        </View>
        </>
    );
}

const styles = StyleSheet.create({
    reasonText: {
        fontFamily: 'Silkscreen',
        fontSize: 12,
        textAlign: 'center',
        marginTop: -8,
        marginBottom: 14,
    },
    scoreCard: {
        alignSelf: 'stretch',
        alignItems: 'center',
        paddingVertical: 10,
        marginBottom: 12,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    scoreCardRecord: {
        borderWidth: 2,
        borderColor: '#FFD700',
        backgroundColor: 'rgba(255,215,0,0.08)',
    },
    scoreLabel: {
        fontFamily: 'Silkscreen',
        fontSize: 14,
    },
    recordBadge: {
        fontFamily: 'Silkscreen',
        fontSize: 14,
        color: '#1A1200',
        backgroundColor: '#FFD700',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 6,
        overflow: 'hidden',
    },
    toRecord: {
        fontFamily: 'Silkscreen',
        fontSize: 12,
    },
    medalCard: {
        alignSelf: 'stretch',
        padding: 12,
        marginBottom: 12,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: 'rgba(255,215,0,0.45)',
        backgroundColor: 'rgba(255,215,0,0.06)',
        gap: 8,
    },
    medalHead: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    medalIcons: {
        flexDirection: 'row',
        gap: 4,
    },
    medalTitle: {
        flex: 1,
        fontFamily: 'Silkscreen',
        fontSize: 13,
    },
    medalTrack: {
        height: 8,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.12)',
        overflow: 'hidden',
    },
    medalFill: {
        height: 8,
        backgroundColor: '#FFD700',
    },
    medalNext: {
        fontFamily: 'Silkscreen',
        fontSize: 15,
        color: '#FFD700',
        textAlign: 'center',
    },
    coinsPill: {
        alignSelf: 'center',
        paddingHorizontal: 14,
        paddingVertical: 5,
        borderRadius: 14,
        backgroundColor: 'rgba(255,215,0,0.12)',
        marginBottom: 6,
    },
    secondaryRow: {
        flexDirection: 'row',
        gap: 10,
        justifyContent: 'center',
        alignSelf: 'stretch',
    },
    secondaryButton: {
        flex: 1,
        minWidth: 0,
        height: 46,
        margin: 0,
    },
    nickRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        width: '100%',
    },
    medalRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 6,
    },
    gameOverText: {
        fontSize: 36,
        fontFamily: 'Silkscreen',
        marginBottom: 16,
        textAlign: 'center',
        ...Platform.select({
            web: {
                textShadow: "2px 2px 3px rgba(0, 0, 0, 0.75)"
            },
            default: {
                textShadowColor: 'rgba(0, 0, 0, 0.75)',
                textShadowOffset: { width: 2, height: 2 },
                textShadowRadius: 3
            }
        })
    },
    scoreText: {
        fontSize: 24,
        fontFamily: 'Silkscreen',
        marginBottom: 10,
        textAlign: 'center',
    },
    scoreValue: {
        fontSize: 42,
        fontFamily: 'SilkscreenBold',
        marginBottom: 8,
        textAlign: 'center',
    },
    coinsText: {
        fontSize: 14,
        fontFamily: 'Silkscreen',
        marginBottom: 12,
        textAlign: 'center',
    },
    statusContainer: {
        marginTop: 20,
        marginBottom: 12,
        alignItems: 'center',
        paddingHorizontal: 20,
        width: '100%'
    },
    statusText: {
        fontSize: 18,
        fontFamily: 'Silkscreen',
        textAlign: 'center',
    },
    messageText: {
        fontSize: 16,
        fontFamily: 'Silkscreen',
        marginBottom: 12,
        textAlign: 'center',
        paddingHorizontal: 20,
    },
    buttonContainer: {
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        gap: 15
    },
    nicknameInput: {
        width: '80%',
        maxWidth: 300,
        height: 45,
        borderWidth: 2,
        borderRadius: 8,
        paddingHorizontal: 15,
        fontSize: 18,
        fontFamily: 'Silkscreen',
        textAlign: 'center',
    }
});
