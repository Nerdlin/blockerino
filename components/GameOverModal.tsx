import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View, TextInput, Alert, Platform } from "react-native";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import { GameModeType, MenuStateType, useSetAppState } from "@/hooks/useAppState";
import { useSoundSettings } from "@/constants/Sound";
import { useTheme, ThemeType } from "@/constants/Theme";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { submitGlobalHighScore, isTopScore } from "@/constants/Supabase";
import AsyncStorage from '@react-native-async-storage/async-storage';

const PLAYER_NAME_KEY = 'PLAYER_NAME';

export default function GameOverModal({ score, gameMode }: { score: number, gameMode: GameModeType }) {
    const [setAppState, appendAppState] = useSetAppState();
    const { playSfx } = useSoundSettings();
    const { currentTheme } = useTheme();
    const scale = useSharedValue(1);
    const [playerName, setPlayerName] = useState('Anonymous');
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'failed'>('idle');

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
    }, []);

    useEffect(() => {
        // Автоматическая отправка рекорда на Supabase
        const autoSubmit = async () => {
            setSubmitStatus('submitting');
            try {
                let savedName = await AsyncStorage.getItem(PLAYER_NAME_KEY);
                const nameToSubmit = savedName ? savedName.trim() : 'Anonymous';
                setPlayerName(nameToSubmit);
                
                const success = await submitGlobalHighScore(nameToSubmit, score, gameMode);
                if (success) {
                    setSubmitStatus('success');
                } else {
                    setSubmitStatus('failed');
                }
            } catch (err) {
                console.error('Error auto-submitting high score:', err);
                setSubmitStatus('failed');
            }
        };

        autoSubmit();
    }, [score, gameMode]);

    const animatedTextStyle = useAnimatedStyle(() => {
        return {
            transform: [{ scale: scale.value }]
        };
    });

    const handlePlayAgain = () => {
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

            <View style={styles.statusContainer}>
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
                {submitStatus === 'failed' && (
                    <Text style={[styles.statusText, { color: 'rgb(255, 80, 80)' }]}>
                        Could not sync score to leaderboard.
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
        marginBottom: 30,
        textAlign: 'center',
        fontWeight: 'bold',
    },
    statusContainer: {
        marginBottom: 20,
        alignItems: 'center',
        paddingHorizontal: 20,
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
    }
});
