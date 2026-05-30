import { useEffect } from "react";
import { StyleSheet, Text, Platform } from "react-native";
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	withTiming,
	withSequence,
	Easing,
	runOnJS,
} from "react-native-reanimated";

interface ScorePopupProps {
	points: number;
	x: number;
	y: number;
	onComplete?: () => void;
}

export function ScorePopup({ points, x, y, onComplete }: ScorePopupProps) {
	const opacity = useSharedValue(1);
	const translateY = useSharedValue(0);
	const scale = useSharedValue(0.5);

	useEffect(() => {
		// Анимация появления и исчезновения
		opacity.value = withSequence(
			withTiming(1, { duration: 100 }),
			withTiming(1, { duration: 800 }),
			withTiming(0, { duration: 300 }, (isFinished) => {
				if (isFinished && onComplete) {
					runOnJS(onComplete)();
				}
			})
		);

		// Движение вверх
		translateY.value = withTiming(-100, {
			duration: 1200,
			easing: Easing.out(Easing.cubic),
		});

		// Масштабирование
		scale.value = withSequence(
			withTiming(1.5, { duration: 200, easing: Easing.out(Easing.back(2)) }),
			withTiming(1, { duration: 100 })
		);
	}, [opacity, translateY, scale, onComplete]);

	const animatedStyle = useAnimatedStyle(() => {
		return {
			opacity: opacity.value,
			transform: [
				{ translateY: translateY.value },
				{ scale: scale.value },
			],
		};
	});

	return (
		<Animated.View
			style={[
				styles.container,
				{
					left: x,
					top: y,
				},
				animatedStyle,
			]}
		>
			<Text style={styles.text}>+{points}</Text>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	container: {
		position: "absolute",
		zIndex: 1000,
	},
	text: {
		color: "#FFD700",
		fontFamily: "SilkscreenBold",
		fontSize: 32,
		fontWeight: "bold",
		...Platform.select({
			web: {
				textShadow: "2px 2px 4px rgba(0, 0, 0, 0.8)"
			},
			default: {
				textShadowColor: "rgba(0, 0, 0, 0.8)",
				textShadowOffset: { width: 2, height: 2 },
				textShadowRadius: 4,
			}
		}),
	},
});
