import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View, TextInput, Alert } from "react-native";
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
    const [setAppState, appendAppState, popAppState] = useSetAppState();
    const { playSfx } = useSoundSettings();
    const { currentTheme } = useTheme();
    const scale = useSharedValue(1);
    const [showNameInput, setShowNameInput] = useState(false);
    const [playerName, setPlayerName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isTopScoreValue, setIsTopScoreValue] = useState(false);

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

        // Проверяем, попал ли счет в топ-100
        isTopScore(score, gameMode, 100).then(isTop => {
            setIsTopScoreValue(isTop);
            if (isTop) {
                // Загружаем сохраненное имя игрока
                AsyncStorage.getItem(PLAYER_NAME_KEY).then(savedName => {
                    if (savedName) {
                        setPlayerName(savedName);
                    }
                });
            }
        });
    }, []);

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

    const handleSubmitScore = async () => {
        if (!playerName.trim()) {
            Alert.alert('Error', 'Please enter your name');
            return;
        }

        setIsSubmitting(true);

        // Сохраняем имя игрока для будущих игр
        await AsyncStorage.setItem(PLAYER_NAME_KEY, playerName.trim());

        const success = await submitGlobalHighScore(playerName.trim(), score, gameMode);

        setIsSubmitting(false);

        if (success) {
            Alert.alert('Success!', 'Your score has been submitted to the global leaderboard!');
            setShowNameInput(false);
        } else {
            Alert.alert('Error', 'Failed to submit score. Please try again later.');
        }
    };

    const handleShowNameInput = () => {
        playSfx('menuClick');
        setShowNameInput(true);
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

            {isTopScoreValue && !showNameInput && (
                <View style={styles.topScoreContainer}>
                    <Text style={[styles.topScoreText, { color: currentTheme.accent }]}>
                        🏆 Top 100 Score! 🏆
                    </Text>
                    <StylizedButton
                        text="Submit to Global Leaderboard"
                        onClick={handleShowNameInput}
                        backgroundColor={currentTheme.id === ThemeType.BLUE ? 'rgb(255, 153, 0)' : currentTheme.accent}
                    />
                </View>
            )}

            {showNameInput && (
                <View style={styles.nameInputContainer}>
                    <Text style={[styles.nameInputLabel, { color: currentTheme.textPrimary }]}>
                        Enter your name:
                    </Text>
                    <TextInput
                        style={[styles.nameInput, {
                            color: currentTheme.textPrimary,
                            borderColor: currentTheme.textSecondary,
                            backgroundColor: currentTheme.menuBackground
                        }]}
                        value={playerName}
                        onChangeText={setPlayerName}
                        placeholder="Your Name"
                        placeholderTextColor={currentTheme.textSecondary}
                        maxLength={20}
                        autoFocus
                    />
                    <StylizedButton
                        text={isSubmitting ? "Submitting..." : "Submit Score"}
                        onClick={handleSubmitScore}
                        backgroundColor={currentTheme.id === ThemeType.BLUE ? 'rgb(0, 153, 51)' : currentTheme.buttonPrimary}
                        disabled={isSubmitting}
                    />
                </View>
            )}

            <Text style={[
                styles.messageText,
                {
                    color: currentTheme.id === ThemeType.BLUE ? 'rgb(0, 153, 255)' : currentTheme.textSecondary
                }
            ]}>
                No more space for blocks on the board.
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
        textShadowColor: 'rgba(0, 0, 0, 0.75)',
        textShadowOffset: { width: 2, height: 2 },
        textShadowRadius: 3
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
    topScoreContainer: {
        marginBottom: 20,
        alignItems: 'center',
        gap: 10
    },
    topScoreText: {
        fontSize: 20,
        fontFamily: 'Silkscreen',
        textAlign: 'center',
    },
    nameInputContainer: {
        marginBottom: 20,
        width: '100%',
        alignItems: 'center',
        gap: 10
    },
    nameInputLabel: {
        fontSize: 18,
        fontFamily: 'Silkscreen',
        textAlign: 'center',
    },
    nameInput: {
        width: '80%',
        fontSize: 20,
        fontFamily: 'Silkscreen',
        padding: 10,
        borderWidth: 2,
        borderRadius: 5,
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
