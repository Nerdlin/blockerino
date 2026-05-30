import { useTheme } from "@/constants/Theme";
import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	withRepeat,
	withTiming,
	Easing,
	interpolateColor,
} from "react-native-reanimated";

export default function AnimatedBackground() {
	const { currentTheme } = useTheme();
	const progress = useSharedValue(0);

	useEffect(() => {
		progress.value = withRepeat(
			withTiming(1, {
				duration: 8000,
				easing: Easing.inOut(Easing.ease),
			}),
			-1,
			true
		);
	}, [progress]);

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

		return {
			backgroundColor,
			opacity: 0.7,
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
