import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import { useTheme } from "@/constants/Theme";
import Animated, { FadeIn } from "react-native-reanimated";

export default function ContinueGameModal({
    score,
    gameMode,
    onContinue,
    onStartOver
}: {
    score: number;
    gameMode: string;
    onContinue: () => void;
    onStartOver: () => void;
}) {
    const { currentTheme } = useTheme();

    return (
        <SimplePopupView style={[{ backgroundColor: currentTheme.menuBackground }]}>
            <Animated.Text
                entering={FadeIn.duration(1000)}
                style={[
                    styles.titleText,
                    {
                        color: currentTheme.buttonPrimary
                    }
                ]}
            >
                Unfinished Game
            </Animated.Text>

            <Text style={[
                styles.detailsText,
                {
                    color: currentTheme.textPrimary
                }
            ]}>
                You have a saved game!
            </Text>

            <View style={styles.statsContainer}>
                <Text style={[styles.statLabel, { color: currentTheme.textSecondary }]}>
                    Mode: <Text style={{ color: currentTheme.textPrimary, textTransform: 'capitalize' }}>{gameMode}</Text>
                </Text>
                <Text style={[styles.statLabel, { color: currentTheme.textSecondary }]}>
                    Score: <Text style={{ color: currentTheme.accent, fontWeight: 'bold' }}>{score}</Text>
                </Text>
            </View>

            <View style={styles.buttonContainer}>
                <StylizedButton
                    text="Continue"
                    onClick={onContinue}
                    backgroundColor={currentTheme.buttonPrimary}
                />

                <StylizedButton
                    text="Start Over"
                    onClick={onStartOver}
                    backgroundColor={currentTheme.buttonSecondary}
                />
            </View>
        </SimplePopupView>
    );
}

const styles = StyleSheet.create({
    titleText: {
        fontSize: 28,
        fontFamily: 'Silkscreen',
        marginBottom: 20,
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
    detailsText: {
        fontSize: 18,
        fontFamily: 'Silkscreen',
        marginBottom: 20,
        textAlign: 'center',
    },
    statsContainer: {
        marginBottom: 30,
        alignItems: 'center',
        gap: 10,
    },
    statLabel: {
        fontSize: 16,
        fontFamily: 'Silkscreen',
    },
    buttonContainer: {
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        gap: 15
    }
});
