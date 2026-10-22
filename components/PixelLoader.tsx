import { useEffect, useRef } from "react";
import { Animated, Easing, StyleProp, View, ViewStyle } from "react-native";

const BLOCK_COLORS = ["#FF3333", "#7C3AED", "#1FA4E0", "#FFD700"];

// The game's own loading indicator: four little blocks in the menu colours that hop one after another.
// A drop-in for ActivityIndicator (size "small" | "large", style), the colour prop is accepted and ignored.
export default function PixelLoader({
	size = "large",
	style,
}: {
	size?: "small" | "large";
	color?: string;
	style?: StyleProp<ViewStyle>;
}) {
	const block = size === "small" ? 7 : 14;
	const gap = size === "small" ? 3 : 6;
	const hop = size === "small" ? 6 : 12;
	const values = useRef(BLOCK_COLORS.map(() => new Animated.Value(0))).current;

	useEffect(() => {
		const loops = values.map((value, index) =>
			Animated.loop(
				Animated.sequence([
					Animated.delay(index * 140),
					Animated.timing(value, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
					Animated.timing(value, { toValue: 0, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }),
					Animated.delay((BLOCK_COLORS.length - 1 - index) * 140 + 200),
				]),
			),
		);
		loops.forEach((loop) => loop.start());
		return () => loops.forEach((loop) => loop.stop());
	}, [values]);

	return (
		<View
			accessibilityRole="progressbar"
			style={[{ flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap, height: block + hop, paddingTop: hop }, style]}
		>
			{BLOCK_COLORS.map((color, index) => (
				<Animated.View
					key={color}
					style={{
						width: block,
						height: block,
						backgroundColor: color,
						borderWidth: size === "small" ? 1 : 2,
						borderColor: "rgba(255,255,255,0.28)",
						transform: [{ translateY: values[index].interpolate({ inputRange: [0, 1], outputRange: [0, -hop] }) }],
					}}
				/>
			))}
		</View>
	);
}
