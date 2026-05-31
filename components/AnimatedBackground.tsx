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
	const pulse = useSharedValue(1);
	const activeCombo = useAtomValue(activeComboAtom);

	// Dynamically adjust animation speed based on active combo count
	useEffect(() => {
		// Normal speed: 8000ms duration.
		// Speeds up incrementally with higher combos:
		// Combo 0 -> 8000ms
		// Combo 1 -> 5500ms
		// Combo 2 -> 3800ms
		// Combo 3 -> 2500ms
		// Combo >= 4 -> 1500ms
		const duration = Math.max(1500, 8000 - activeCombo * 1800);
		
		progress.value = withRepeat(
			withTiming(1, {
				duration: duration,
				easing: Easing.inOut(Easing.ease),
			}),
			-1,
			true
		);
	}, [activeCombo, progress]);

	// Trigger a pulse effect when the active combo increases
	useEffect(() => {
		if (activeCombo > 0) {
			pulse.value = withSequence(
				withTiming(1.06, { duration: 150, easing: Easing.out(Easing.quad) }),
				withTiming(1, { duration: 300, easing: Easing.inOut(Easing.quad) })
			);
		}
	}, [activeCombo, pulse]);

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
			transform: [
				{ scale: pulse.value }
			]
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

		// Increase overlay opacity during combos for higher intensity
		const baseOpacity = 0.5;
		const comboOpacityBoost = Math.min(0.4, activeCombo * 0.1);

		return {
			backgroundColor,
			opacity: (baseOpacity + comboOpacityBoost) * pulse.value,
			transform: [
				{ scale: pulse.value }
			]
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
	},
	overlay: {
		opacity: 0.5,
	},
});
