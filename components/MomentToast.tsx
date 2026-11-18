import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import Animated, { FadeInDown, FadeOut } from "react-native-reanimated";
import UiIcon from "./UiIcon";
import { useLanguage } from "@/constants/Localization";
import { useTheme } from "@/constants/Theme";

/** How long the offer stays after a big combo. */
export const MOMENT_TOAST_MS = 7000;

/**
 * A small button that appears over the board after a big combo: "Share moment". It goes away on its own, so it never
 * stays in the way of the next move.
 */
export default function MomentToast({ offerId, onPress, onExpire }: { offerId: number; onPress: () => void; onExpire: () => void }) {
	const { t } = useLanguage();
	const { currentTheme } = useTheme();

	useEffect(() => {
		const timer = setTimeout(onExpire, MOMENT_TOAST_MS);
		return () => clearTimeout(timer);
		// a newer combo restarts the countdown
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [offerId]);

	return (
		<Animated.View entering={FadeInDown.duration(260)} exiting={FadeOut.duration(200)} style={styles.wrap} pointerEvents="box-none">
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={t("moment.button")}
				onPress={onPress}
				style={[styles.pill, { backgroundColor: currentTheme.menuBackground, borderColor: currentTheme.accent }]}
			>
				<UiIcon name="film" size={18} />
				<Text style={[styles.text, { color: currentTheme.accent }]}>{t("moment.button")}</Text>
			</Pressable>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		position: "absolute",
		top: -40,
		left: 0,
		right: 0,
		alignItems: "center",
		zIndex: 20000,
	},
	pill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingVertical: 6,
		paddingHorizontal: 12,
		borderWidth: 2,
		borderRadius: 999,
	},
	text: {
		fontFamily: "Silkscreen",
		fontSize: 12,
	},
});
