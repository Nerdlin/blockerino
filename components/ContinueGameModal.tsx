import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import {useTheme, opaqueColor } from "@/constants/Theme";
import Animated, { FadeIn } from "react-native-reanimated";
import { GameModeType } from "@/hooks/useAppState";
import { useLanguage } from "@/constants/Localization";

export default function ContinueGameModal({
    score,
    gameMode,
    onContinue,
    onStartOver
}: {
    score: number;
    gameMode: GameModeType;
    onContinue: () => void;
    onStartOver: () => void;
}) {
    const { currentTheme } = useTheme();
    const { t } = useLanguage();
    const modeTitle = t(`mode.${gameMode}`);
    // The window pops up over the main menu when the app starts, often under a finger already on its way to a menu
    // button: it takes no taps for a moment, then one tap is enough (that short delay is the guard against a stray tap).
    const [armed, setArmed] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setArmed(true), 700);
        return () => clearTimeout(timer);
    }, []);

    return (
        <>
        {/* dims and blocks the menu behind, including the buttons in its corners */}
        <View pointerEvents="auto" style={styles.backdrop} />
        <SimplePopupView style={[{ backgroundColor: opaqueColor(currentTheme.menuBackground) }]}>
            <Animated.Text
                entering={FadeIn.duration(1000)}
                style={[
                    styles.titleText,
                    {
                        color: currentTheme.buttonPrimary
                    }
                ]}
            >
                {t("over.unfinishedGame")}
            </Animated.Text>

            <Text style={[
                styles.detailsText,
                {
                    color: currentTheme.textPrimary
                }
            ]}>
                {t("over.savedGame")}
            </Text>

            <View style={styles.statsContainer}>
                <Text style={[styles.statLabel, { color: currentTheme.textSecondary }]}>
                    {t("over.mode")} <Text style={{ color: currentTheme.textPrimary }}>{modeTitle}</Text>
                </Text>
                <Text style={[styles.statLabel, { color: currentTheme.textSecondary }]}>
                    {t("over.score")} <Text style={{ color: currentTheme.accent, fontFamily: 'SilkscreenBold' }}>{score}</Text>
                </Text>
            </View>

            <View style={styles.buttonContainer}>
                <StylizedButton
                    text={t("over.continue")}
                    onClick={() => { if (armed) onContinue(); }}
                    backgroundColor={currentTheme.buttonPrimary}
                />

                <StylizedButton
                    text={t("over.startOver")}
                    onClick={() => { if (armed) onStartOver(); }}
                    backgroundColor={currentTheme.buttonSecondary}
                />
            </View>
        </SimplePopupView>
        </>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        zIndex: 99,
    },
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
