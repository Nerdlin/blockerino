import { useTheme } from "@/constants/Theme";
import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	withRepeat,
	withTiming,
	withSequence,
	Easing,
	interpolateColor,
} from "react-native-reanimated";
import { useAtomValue } from "jotai";
import { activeComboAtom } from "@/hooks/useAppState";

export default function AnimatedBackground() {
	const { currentTheme } = useTheme();
	const progress = useSharedValue(0);
	const activeCombo = useAtomValue(activeComboAtom);
	const pulse = useSharedValue(1);

	useEffect(() => {
		// Speed up based on combo: base is 8000ms, speed increases with combo
		const baseDuration = 8000;
		const speedMultiplier = 1 + activeCombo * 0.45; // 45% faster per combo point
		const duration = baseDuration / speedMultiplier;

		progress.value = withRepeat(
			withTiming(1, {
				duration: duration,
				easing: Easing.inOut(Easing.ease),
			}),
			-1,
			true
		);
	}, [progress, activeCombo]);

	const animatedStyle = useAnimatedStyle(() => {
		const backgroundColor = interpolateColor(
			progress.value,
			[0, 0.5, 1],
			[
				currentTheme.backgroundGradient1,
				currentTheme.backgroundGradient2,
				currentTheme.backgroundGradient1,
			]
		);

		return {
			backgroundColor,
		};
	});

	const animatedStyle2 = useAnimatedStyle(() => {
		const backgroundColor = interpolateColor(
			progress.value,
			[0, 0.5, 1],
			[
				currentTheme.backgroundGradient2,
				currentTheme.backgroundGradient3,
				currentTheme.backgroundGradient2,
			]
		);

		// Increase background glow intensity during combos
		const baseOpacity = 0.5;
		const comboBonus = activeCombo > 0 ? Math.min(0.4, activeCombo * 0.12) : 0;

		return {
			backgroundColor,
			opacity: baseOpacity + comboBonus,
		};
	});

	return (
		<>
			<Animated.View style={[styles.background, animatedStyle]} />
			<Animated.View style={[styles.background, styles.overlay, animatedStyle2]} />
		</>
	);
}

const styles = StyleSheet.create({
	background: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		zIndex: 0,
	},
	overlay: {
		opacity: 0.5,
	},
});
