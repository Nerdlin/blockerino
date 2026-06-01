import { useTheme } from "@/constants/Theme";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	cancelAnimation,
	withRepeat,
	withTiming,
	Easing,
	interpolateColor,
} from "react-native-reanimated";
import { useAtomValue } from "jotai";
import { activeComboAtom } from "@/hooks/useAppState";

type AnimatedBackgroundProps = {
	isGameplayActive?: boolean;
};

export default function AnimatedBackground({ isGameplayActive = false }: AnimatedBackgroundProps) {
	const { currentTheme } = useTheme();
	const progress = useSharedValue(0);
	const activeCombo = useAtomValue(activeComboAtom);
	const animationCombo = isGameplayActive ? 0 : activeCombo;

	useEffect(() => {
		if (isGameplayActive) {
			cancelAnimation(progress);
			progress.value = withTiming(0, { duration: 350 });
			return;
		}

		const baseDuration = 10000;
		const speedMultiplier = 1 + animationCombo * 0.25;
		const duration = baseDuration / speedMultiplier;

		progress.value = withRepeat(
			withTiming(1, {
				duration: duration,
				easing: Easing.inOut(Easing.ease),
			}),
			-1,
			true
		);
	}, [progress, animationCombo, isGameplayActive]);

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

		const baseOpacity = 0.5;
		const comboBonus = !isGameplayActive && activeCombo > 0 ? Math.min(0.25, activeCombo * 0.08) : 0;

		return {
			backgroundColor,
			opacity: baseOpacity + comboBonus,
		};
	});

	return (
		<>
			<Animated.View style={[styles.background, animatedStyle]} />
			<Animated.View style={[styles.background, styles.overlay, animatedStyle2]} />
			{isGameplayActive && <View style={styles.gameplayScrim} />}
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
	gameplayScrim: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: "rgba(0, 0, 0, 0.55)",
		pointerEvents: "none",
		zIndex: 0,
	},
});
