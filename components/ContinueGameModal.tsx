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
    // button: it takes no taps for a moment, and throwing the saved game away needs a second tap.
    const [armed, setArmed] = useState(false);
    const [confirmStartOver, setConfirmStartOver] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setArmed(true), 700);
        return () => clearTimeout(timer);
    }, []);
    useEffect(() => {
        if (!confirmStartOver) return;
        const timer = setTimeout(() => setConfirmStartOver(false), 4000);
        return () => clearTimeout(timer);
    }, [confirmStartOver]);

    return (
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
                    text={confirmStartOver ? t("over.startOverConfirm") : t("over.startOver")}
                    onClick={() => {
                        if (!armed) return;
                        if (confirmStartOver) onStartOver();
                        else setConfirmStartOver(true);
                    }}
                    backgroundColor={confirmStartOver ? "#B91C1C" : currentTheme.buttonSecondary}
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
