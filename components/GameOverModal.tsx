import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, Platform, TextInput } from "react-native";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import { GameModeType, MenuStateType, useSetAppState } from "@/hooks/useAppState";
import { useSoundSettings } from "@/constants/Sound";
import { useTheme, ThemeType } from "@/constants/Theme";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizePlayerName } from "@/constants/Multiplayer";
import { submitGlobalHighScoreOrQueue } from "@/constants/OfflineSync";
import { useShopState } from "@/constants/Shop";

const PLAYER_NAME_KEY = 'PLAYER_NAME';

export default function GameOverModal({ score, gameMode }: { score: number, gameMode: GameModeType }) {
    const [setAppState, appendAppState] = useSetAppState();
    const { playSfx } = useSoundSettings();
    const { currentTheme } = useTheme();
    const scale = useSharedValue(1);
    const [playerName, setPlayerName] = useState('');
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'queued' | 'failed' | 'needs_name'>('idle');
    const [coinsAwarded, setCoinsAwarded] = useState(0);
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
        if (coinsAwardedRef.current) return;
        coinsAwardedRef.current = true;
        awardCoins(score).then(setCoinsAwarded);
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

    return (
        <SimplePopupView style={[{ backgroundColor: currentTheme.menuBackground }]}>
            <Animated.Text
                entering={FadeIn.duration(1000)}
                style={[
                    styles.gameOverText,
                    {
                        color: currentTheme.id === ThemeType.BLUE ? 'rgb(0, 153, 255)' : currentTheme.buttonPrimary
                    },
                    animatedTextStyle
                ]}
            >
                Game Over
            </Animated.Text>

            <Text style={[
                styles.scoreText,
                {
                    color: currentTheme.id === ThemeType.BLUE ? 'rgb(0, 153, 255)' : currentTheme.textPrimary
                }
            ]}>
                Your Score
            </Text>

            <Text style={[
                styles.scoreValue,
                {
                    color: currentTheme.id === ThemeType.BLUE ? 'rgb(255, 204, 0)' : currentTheme.accent
                }
            ]}>
                {score}
            </Text>

            {coinsAwarded > 0 && (
                <Text style={[styles.coinsText, { color: currentTheme.accent }]}>
                    +{coinsAwarded} shop coins
                </Text>
            )}

            <View style={styles.statusContainer}>
                {canEditNickname && (
                    <View style={{ width: '100%', alignItems: 'center', gap: 10 }}>
                        <Text style={[styles.messageText, { color: currentTheme.textSecondary, marginBottom: 5, paddingHorizontal: 0 }]}>
                            Enter a nickname to save your score!
                        </Text>
                        <TextInput
                            style={[styles.nicknameInput, {
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
                            placeholder="Your Nickname"
                            placeholderTextColor="gray"
                            maxLength={15}
                        />
                        <StylizedButton
                            text="Save Score"
                            onClick={handleManualSubmit}
                            backgroundColor={currentTheme.buttonPrimary}
                        />
                    </View>
                )}
                {submitStatus === 'submitting' && (
                    <Text style={[styles.statusText, { color: currentTheme.textSecondary }]}>
                        Saving score to global leaderboard...
                    </Text>
                )}
                {submitStatus === 'success' && (
                    <Text style={[styles.statusText, { color: 'rgb(0, 200, 80)' }]}>
                        🏆 Score saved under "{playerName}"!
                    </Text>
                )}
                {submitStatus === 'queued' && (
                    <Text style={[styles.statusText, { color: currentTheme.accent }]}>
                        Score saved offline. It will sync when internet returns.
                    </Text>
                )}
                {submitStatus === 'failed' && (
                    <Text style={[styles.statusText, { color: 'rgb(255, 80, 80)' }]}>
                        Could not sync score to leaderboard.
                    </Text>
                )}
                {submitStatus === 'needs_name' && (
                    <Text style={[styles.statusText, { color: 'rgb(255, 80, 80)' }]}>
                        Enter a nickname first.
                    </Text>
                )}
            </View>

            <Text style={[
                styles.messageText,
                {
                    color: currentTheme.id === ThemeType.BLUE ? 'rgb(0, 153, 255)' : currentTheme.textSecondary
                }
            ]}>
                {gameMode === GameModeType.TimeAttack 
                    ? "Time ran out!" 
                    : "No more space for blocks on the board."}
            </Text>

            <View style={styles.buttonContainer}>
                <StylizedButton
                    text="Play Again"
                    onClick={handlePlayAgain}
                    backgroundColor={currentTheme.id === ThemeType.BLUE ? 'rgb(0, 153, 51)' : currentTheme.buttonPrimary}
                />

                <StylizedButton
                    text="Main Menu"
                    onClick={handleMainMenu}
                    backgroundColor={currentTheme.id === ThemeType.BLUE ? 'rgb(0, 102, 204)' : currentTheme.buttonSecondary}
                />
            </View>
        </SimplePopupView>
    );
}

const styles = StyleSheet.create({
    gameOverText: {
        fontSize: 36,
        fontFamily: 'Silkscreen',
        marginBottom: 30,
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
        fontFamily: 'Silkscreen',
        marginBottom: 8,
        textAlign: 'center',
        fontWeight: 'bold',
    },
    coinsText: {
        fontSize: 14,
        fontFamily: 'Silkscreen',
        marginBottom: 24,
        textAlign: 'center',
    },
    statusContainer: {
        marginBottom: 20,
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
        marginBottom: 30,
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
