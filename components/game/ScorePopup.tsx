import { useEffect, useRef } from "react";
import { StyleSheet, Text, Platform } from "react-native";
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	withTiming,
	withSequence,
	Easing,
	runOnJS,
} from "react-native-reanimated";

function getEncouragingText(points: number): string {
	if (points >= 500) {
		const spectaculars = ["Incredible!", "Spectacular!", "Unbelievable!", "LEGENDARY!", "GODLIKE!"];
		return spectaculars[Math.floor(Math.random() * spectaculars.length)];
	}
	if (points >= 150) {
		const awesomes = ["Amazing!", "Awesome!", "Fantastic!", "Superb!", "KABOOM!"];
		return awesomes[Math.floor(Math.random() * awesomes.length)];
	}
	if (points >= 50) {
		const goods = ["Great!", "Good!", "Nice!", "Super!", "Sweet!"];
		return goods[Math.floor(Math.random() * goods.length)];
	}
	if (points > 5) {
		const nices = ["Nice!", "Cool!", "Combo!", "Sweet!"];
		return nices[Math.floor(Math.random() * nices.length)];
	}
	return "";
}

function getEncouragingColor(points: number): string {
	if (points >= 500) return "#FF1493"; // Deep pink
	if (points >= 150) return "#FF00FF"; // Magenta / Orange
	if (points >= 50) return "#00FFFF"; // Cyan
	return "#32CD32"; // Lime green
}

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

	const onCompleteRef = useRef(onComplete);
	useEffect(() => {
		onCompleteRef.current = onComplete;
	}, [onComplete]);

	useEffect(() => {
		// Анимация появления и исчезновения
		opacity.value = withSequence(
			withTiming(1, { duration: 100 }),
			withTiming(1, { duration: 800 }),
			withTiming(0, { duration: 300 }, (isFinished) => {
				if (isFinished && onCompleteRef.current) {
					runOnJS(onCompleteRef.current)();
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
	}, [opacity, translateY, scale]);

	const animatedStyle = useAnimatedStyle(() => {
		return {
			opacity: opacity.value,
			transform: [
				{ translateY: translateY.value },
				{ scale: scale.value },
			],
		};
	});

	const encourages = getEncouragingText(points);
	const encourageColor = getEncouragingColor(points);

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
			{encourages !== "" && (
				<Text style={[styles.subText, { color: encourageColor }]}>{encourages}</Text>
			)}
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	container: {
		position: "absolute",
		zIndex: 1000,
		alignItems: "center",
		justifyContent: "center",
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
	subText: {
		fontFamily: "SilkscreenBold",
		fontSize: 22,
		fontWeight: "bold",
		marginTop: 4,
		textAlign: 'center',
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
