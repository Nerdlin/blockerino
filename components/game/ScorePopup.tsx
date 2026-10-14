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

export function getEncouragingText(points: number): string {
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

export function getEncouragingColor(points: number): string {
	if (points >= 500) return "#FF1493"; // Deep pink
	if (points >= 150) return "#FF00FF"; // Magenta / Orange
	if (points >= 50) return "#00FFFF"; // Cyan
	return "#32CD32"; // Lime green
}

interface ScorePopupProps {
	points: number;
	x: number;
	y: number;
	gridBlockSize?: number;
	boardLength?: number;
	gridWidth?: number;
	gridHeight?: number;
	onComplete?: () => void;
}

export function ScorePopup({
	points,
	x,
	y,
	gridBlockSize = 46,
	boardLength = 8,
	gridWidth,
	gridHeight,
	onComplete,
}: ScorePopupProps) {
	const opacity = useSharedValue(1);
	const translateY = useSharedValue(0);
	const scale = useSharedValue(0.6);

	const totalWidth = gridWidth ?? (gridBlockSize * boardLength);
	const totalHeight = gridHeight ?? totalWidth;

	// Clamp popup width so it comfortably fits within board width
	const popupWidth = Math.min(200, Math.max(140, totalWidth - 24));

	// Center popup relative to the target cell
	const cellCenterX = x + gridBlockSize / 2;
	const cellCenterY = y + gridBlockSize / 2;

	// Clamp left position strictly inside the game board [PADDING, totalWidth - popupWidth - PADDING]
	const HORIZONTAL_PADDING = 8;
	const minLeft = HORIZONTAL_PADDING;
	const maxLeft = Math.max(minLeft, totalWidth - popupWidth - HORIZONTAL_PADDING);
	const idealLeft = cellCenterX - popupWidth / 2;
	const clampedLeft = Math.max(minLeft, Math.min(maxLeft, idealLeft));

	// Animation floats up by FLOAT_UP px
	const FLOAT_UP = 36;
	const VERTICAL_PADDING = 10;
	// Estimated popup content height ~55px
	const popupHeight = 55;
	// Ensure top position + float never goes above VERTICAL_PADDING
	const minTop = FLOAT_UP + VERTICAL_PADDING;
	const maxTop = Math.max(minTop, totalHeight - popupHeight - VERTICAL_PADDING);
	const idealTop = cellCenterY - popupHeight / 2;
	const clampedTop = Math.max(minTop, Math.min(maxTop, idealTop));

	const onCompleteRef = useRef(onComplete);
	useEffect(() => {
		onCompleteRef.current = onComplete;
	}, [onComplete]);

	// Wrap in a JS function so we don't pass the ref to the worklet
	const handleComplete = () => {
		if (onCompleteRef.current) {
			onCompleteRef.current();
		}
	};

	useEffect(() => {
		// Анимация появления и исчезновения
		opacity.value = withSequence(
			withTiming(1, { duration: 100 }),
			withTiming(1, { duration: 750 }),
			withTiming(0, { duration: 250 }, (isFinished) => {
				if (isFinished) {
					runOnJS(handleComplete)();
				}
			})
		);

		// Умеренное движение вверх, гарантирующее непревышение верхних рамок игры
		translateY.value = withTiming(-FLOAT_UP, {
			duration: 1100,
			easing: Easing.out(Easing.cubic),
		});

		// Аккуратное масштабирование
		scale.value = withSequence(
			withTiming(1.2, { duration: 180, easing: Easing.out(Easing.back(1.5)) }),
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
					left: clampedLeft,
					top: clampedTop,
					width: popupWidth,
				},
				animatedStyle,
			]}
		>
			<Text
				style={styles.text}
				numberOfLines={1}
				adjustsFontSizeToFit
				minimumFontScale={0.7}
			>
				+{points}
			</Text>
			{encourages !== "" && (
				<Text
					style={[styles.subText, { color: encourageColor }]}
					numberOfLines={1}
					adjustsFontSizeToFit
					minimumFontScale={0.7}
				>
					{encourages}
				</Text>
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
		fontSize: 26,
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
	subText: {
		fontFamily: "SilkscreenBold",
		fontSize: 18,
		marginTop: 2,
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
