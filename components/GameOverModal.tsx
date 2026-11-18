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
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
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
import { getMomentSnapshot } from "@/constants/MomentStore";
import { buildMomentShareText } from "@/constants/ShareMoment";
import MomentShareModal from "./MomentShareModal";
import { getAccountSession } from '@/constants/AccountSession';
import { getMedalForScore, getMedals, getNextMedal } from '@/constants/RunGoals';
import MedalTrack from './MedalTrack';

const MEDAL_TINT = { bronze: '#E09A5A', silver: '#D6DDE4', gold: '#FFD23F' } as const;

const PLAYER_NAME_KEY = 'PLAYER_NAME';
const GAMES_FINISHED_KEY = 'GAMES_FINISHED';
// Guests are asked to create an account only after a few games, never straight after the first one.
const ACCOUNT_PROMPT_AFTER_GAMES = 3;

export default function GameOverModal({ score, gameMode, reason }: { score: number, gameMode: GameModeType, reason?: GameOverReason | null }) {
    const [setAppState, appendAppState] = useSetAppState();
    const { playSfx } = useSoundSettings();
    const { currentTheme } = useTheme();
    const { t } = useLanguage();
    const [playerName, setPlayerName] = useState('');
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'queued' | 'failed' | 'needs_name'>('idle');
    const [coinsAwarded, setCoinsAwarded] = useState(0);
    const [signedIn, setSignedIn] = useState(true);
    const [bestScore, setBestScore] = useState<number | null>(null);
    const [finishedCount, setFinishedCount] = useState(0);
    const shareCardRef = useRef<View>(null);
    const [shareNote, setShareNote] = useState<string | null>(null);
    const [sharing, setSharing] = useState(false);
    // the last moves of this game, ready to be made into a GIF; null when nothing was recorded (a level, a restored game)
    const [momentLog] = useState(() => getMomentSnapshot());
    const [momentOpen, setMomentOpen] = useState(false);

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
    }, [playSfx]);

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

    const reasonKey = reason === "time" ? "over.reason.time" : reason === "move_limit" ? "over.reason.moveLimit" : "over.reason.noRoom";
    const medals = getMedals(gameMode);
    const titleColor = currentTheme.id === ThemeType.BLUE ? 'rgb(0, 153, 255)' : currentTheme.buttonPrimary;
    const scoreColor = currentTheme.id === ThemeType.BLUE ? 'rgb(255, 204, 0)' : currentTheme.accent;
    const medalColor = medal ? MEDAL_TINT[medal.id] : currentTheme.textSecondary;
    // the window grows in, then its parts follow one after another; the score counts once the window is there
    const COUNT_DELAY = 420;
    const countDuration = Math.min(1800, 900 + String(Math.max(0, score)).length * 180);
    const rise = (delay: number) => FadeInDown.delay(delay).duration(420);
    const coinsChip = coinsAwarded > 0 ? (
        <FadeInView pop delay={1000}>
            <View style={styles.coinsChip}>
                <View style={styles.coinDot} />
                <Text style={styles.coinsChipText}>{t("over.coinsAwarded", { coins: coinsAwarded })}</Text>
            </View>
        </FadeInView>
    ) : null;

    return (
        <>
        <Animated.View pointerEvents="none" entering={FadeIn.duration(380)} style={styles.backdrop} />
        <SimplePopupView style={[{ backgroundColor: opaqueColor(currentTheme.menuBackground) }]} contentStyle={styles.content} entrance="pop">
            {/* header */}
            <Animated.Text entering={rise(100)} style={[styles.title, { color: titleColor }]}>
                {t("over.gameOver")}
            </Animated.Text>
            <Animated.Text entering={FadeIn.delay(220).duration(400)} style={[styles.reason, { color: currentTheme.textSecondary }]}>{t(reasonKey)}</Animated.Text>

            {/* the score */}
            <Animated.View entering={rise(260)} style={styles.hero}>
                <Text style={[styles.heroLabel, { color: currentTheme.textSecondary }]}>{t("over.yourScore")}</Text>
                <AnimatedNumber value={score} delay={COUNT_DELAY} duration={countDuration} popOnFinish style={[styles.heroScore, { color: scoreColor }]} />
                {isRecord ? (
                    <FadeInView pop delay={COUNT_DELAY + countDuration}>
                        <Text style={styles.recordBadge}>{t("over.newRecord")}</Text>
                    </FadeInView>
                ) : bestScore !== null && score > 0 ? (
                    <Animated.View entering={FadeIn.delay(COUNT_DELAY + 200).duration(400)} style={styles.bestRow}>
                        <Text style={[styles.bestText, { color: currentTheme.textPrimary }]}>{t("over.bestShort", { best: bestScore })}</Text>
                        <View style={styles.bestDot} />
                        <Text style={[styles.bestText, { color: currentTheme.textSecondary }]}>{t("over.toBestShort", { points: bestScore - score })}</Text>
                    </Animated.View>
                ) : null}
            </Animated.View>

            {/* medal path and the coins of the run */}
            {medals.length > 0 ? (
                <Animated.View entering={rise(460)} style={[styles.panel, medal && { borderColor: `${MEDAL_TINT[medal.id]}55` }]}>
                    <View style={styles.panelHead}>
                        <Text style={[styles.panelTitle, { color: medalColor }]} numberOfLines={1}>
                            {medal ? t(`goals.${medal.id}`) : t("over.noMedal")}
                        </Text>
                        {coinsChip}
                    </View>
                    <MedalTrack medals={medals} score={score} size={30} startDelay={600} />
                    <Text style={[styles.panelNext, { color: currentTheme.textSecondary }]}>
                        {nextMedal ? t("goals.toNextMedal", { medal: t(`goals.${nextMedal.id}`), points: nextMedal.score - score }) : t("goals.done")}
                    </Text>
                </Animated.View>
            ) : coinsChip ? (
                <View style={styles.coinsAlone}>{coinsChip}</View>
            ) : null}

            {/* actions */}
            <Animated.View entering={rise(600)} style={styles.actions}>
                <StylizedButton
                    text={t("over.playAgain")}
                    onClick={handlePlayAgain}
                    backgroundColor={currentTheme.id === ThemeType.BLUE ? 'rgb(0, 153, 51)' : currentTheme.buttonPrimary}
                    style={styles.primaryButton}
                    textStyle={styles.primaryText}
                />
                <View style={styles.secondaryRow}>
                    <StylizedButton
                        text={t("over.mainMenu")}
                        onClick={handleMainMenu}
                        backgroundColor="rgba(255,255,255,0.08)"
                        borderColor="rgba(255,255,255,0.14)"
                        style={styles.secondaryButton}
                        textStyle={styles.secondaryText}
                    />
                    {score > 0 && (
                        <StylizedButton
                            text={t("share.button")}
                            onClick={handleShare}
                            disabled={sharing}
                            backgroundColor="rgba(255,255,255,0.08)"
                            borderColor="rgba(255,255,255,0.14)"
                            style={styles.secondaryButton}
                            textStyle={styles.secondaryText}
                        />
                    )}
                </View>
                {momentLog && score > 0 && (
                    <StylizedButton
                        text={t("moment.button")}
                        onClick={() => {
                            playSfx('menuClick');
                            setMomentOpen(true);
                        }}
                        backgroundColor="rgba(255,255,255,0.08)"
                        borderColor="rgba(255,255,255,0.14)"
                        style={[styles.secondaryButton, styles.momentButton]}
                        textStyle={styles.secondaryText}
                    />
                )}
            </Animated.View>

            {/* where the score went */}
            <Animated.View entering={FadeIn.delay(780).duration(400)} style={styles.footer}>
                {shareNote && <Text style={[styles.status, { color: currentTheme.textSecondary }]}>{shareNote}</Text>}
                {canEditNickname && (
                    <View style={styles.nickBlock}>
                        <Text style={[styles.status, { color: currentTheme.textSecondary }]}>{t("over.enterNickname")}</Text>
                        <View style={styles.nickRow}>
                            <TextInput
                                style={[styles.nicknameInput, {
                                    color: currentTheme.textPrimary,
                                    borderColor: submitStatus === 'needs_name' ? 'rgb(255, 80, 80)' : 'rgba(255,255,255,0.18)',
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
                                style={styles.nickButton}
                                textStyle={{ fontSize: 12 }}
                            />
                        </View>
                        {!signedIn && finishedCount >= ACCOUNT_PROMPT_AFTER_GAMES && (
                            <View style={styles.accountBlock}>
                                <Text style={[styles.status, { color: currentTheme.textSecondary, fontSize: 11 }]}>{t("over.accountPrompt")}</Text>
                                <View style={styles.accountRow}>
                                    <StylizedButton text={t("over.createAccount")} onClick={() => openAccountScreen('register')} backgroundColor={currentTheme.accent} style={styles.accountButton} textStyle={{ fontSize: 11 }} />
                                    <StylizedButton text={t("over.haveAccount")} onClick={() => openAccountScreen('login')} backgroundColor="rgb(90,90,90)" style={styles.accountButton} textStyle={{ fontSize: 11 }} />
                                </View>
                            </View>
                        )}
                    </View>
                )}
                {submitStatus === 'submitting' && <Text style={[styles.status, { color: currentTheme.textSecondary }]}>{t("over.saving")}</Text>}
                {submitStatus === 'success' && <Text style={[styles.status, { color: 'rgb(74, 222, 128)' }]}>{t("over.saved", { name: playerName })}</Text>}
                {submitStatus === 'queued' && <Text style={[styles.status, { color: currentTheme.accent }]}>{t("over.savedOffline")}</Text>}
                {submitStatus === 'failed' && <Text style={[styles.status, { color: 'rgb(255, 80, 80)' }]}>{t("over.syncFailed")}</Text>}
                {submitStatus === 'needs_name' && <Text style={[styles.status, { color: 'rgb(255, 80, 80)' }]}>{t("over.needName")}</Text>}
            </Animated.View>
        </SimplePopupView>
        {momentOpen && momentLog && (
            <MomentShareModal
                log={momentLog}
                caption={t("moment.captionOver")}
                dimLastFrame
                message={buildMomentShareText(t("share.text"), score, modeTitle)}
                source="game_over"
                onClose={() => setMomentOpen(false)}
            />
        )}
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

const PANEL_BG = 'rgba(255,255,255,0.045)';
const PANEL_BORDER = 'rgba(255,255,255,0.09)';

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 99,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    content: {
        paddingVertical: 18,
        paddingHorizontal: 16,
    },
    title: {
        fontSize: 30,
        fontFamily: 'Silkscreen',
        textAlign: 'center',
        ...Platform.select({
            web: { textShadow: "0 3px 0 rgba(0, 0, 0, 0.6)" },
            default: { textShadowColor: 'rgba(0, 0, 0, 0.6)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
        }),
    },
    reason: {
        fontFamily: 'Silkscreen',
        fontSize: 11,
        textAlign: 'center',
        marginTop: 2,
    },
    hero: {
        alignItems: 'center',
        marginTop: 14,
        marginBottom: 14,
    },
    heroLabel: {
        fontFamily: 'Silkscreen',
        fontSize: 11,
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
    heroScore: {
        fontSize: 56,
        lineHeight: 64,
        fontFamily: 'SilkscreenBold',
        textAlign: 'center',
    },
    bestRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: PANEL_BG,
        borderWidth: 1,
        borderColor: PANEL_BORDER,
    },
    bestText: {
        fontFamily: 'Silkscreen',
        fontSize: 11,
    },
    bestDot: {
        width: 4,
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    recordBadge: {
        fontFamily: 'Silkscreen',
        fontSize: 13,
        color: '#1A1200',
        backgroundColor: '#FFD700',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 6,
        overflow: 'hidden',
    },
    panel: {
        alignSelf: 'stretch',
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: PANEL_BORDER,
        backgroundColor: PANEL_BG,
        gap: 8,
    },
    panelHead: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    panelTitle: {
        flexShrink: 1,
        fontFamily: 'Silkscreen',
        fontSize: 14,
    },
    panelNext: {
        fontFamily: 'Silkscreen',
        fontSize: 11,
        textAlign: 'center',
    },
    coinsChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: 'rgba(255,215,0,0.12)',
    },
    coinDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#FFD700',
    },
    coinsChipText: {
        fontFamily: 'Silkscreen',
        fontSize: 12,
        color: '#FFD700',
    },
    coinsAlone: {
        alignItems: 'center',
    },
    actions: {
        alignSelf: 'stretch',
        gap: 10,
        marginTop: 16,
    },
    primaryButton: {
        alignSelf: 'stretch',
        minWidth: 0,
        height: 56,
        margin: 0,
        borderRadius: 14,
    },
    primaryText: {
        fontSize: 20,
    },
    secondaryRow: {
        flexDirection: 'row',
        gap: 10,
    },
    secondaryButton: {
        flex: 1,
        minWidth: 0,
        height: 46,
        margin: 0,
        borderRadius: 12,
    },
    momentButton: {
        flex: 0,
        alignSelf: 'stretch',
    },
    secondaryText: {
        fontSize: 13,
    },
    footer: {
        alignSelf: 'stretch',
        alignItems: 'center',
        marginTop: 12,
        gap: 6,
    },
    status: {
        fontFamily: 'Silkscreen',
        fontSize: 12,
        textAlign: 'center',
    },
    nickBlock: {
        alignSelf: 'stretch',
        alignItems: 'center',
        gap: 6,
    },
    nickRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        alignSelf: 'stretch',
    },
    nicknameInput: {
        flex: 1,
        height: 42,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 12,
        fontSize: 16,
        fontFamily: 'Silkscreen',
        textAlign: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.35)',
    },
    nickButton: {
        minWidth: 0,
        height: 42,
        paddingHorizontal: 12,
        margin: 0,
    },
    accountBlock: {
        alignSelf: 'stretch',
        alignItems: 'center',
        gap: 6,
        marginTop: 2,
    },
    accountRow: {
        flexDirection: 'row',
        gap: 8,
        alignSelf: 'stretch',
    },
    accountButton: {
        flex: 1,
        minWidth: 0,
        minHeight: 38,
        paddingHorizontal: 4,
        margin: 0,
    },
});
