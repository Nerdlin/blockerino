import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import UiIcon from "./UiIcon";

function Spark({ x, y, delay, size }: { x: number; y: number; delay: number; size: number }) {
	const twinkle = useRef(new Animated.Value(0)).current;
	useEffect(() => {
		const loop = Animated.loop(
			Animated.sequence([
				Animated.delay(delay),
				Animated.timing(twinkle, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
				Animated.timing(twinkle, { toValue: 0, duration: 520, easing: Easing.in(Easing.quad), useNativeDriver: true }),
				Animated.delay(1100),
			])
		);
		loop.start();
		return () => loop.stop();
	}, [twinkle, delay]);
	return (
		<Animated.View
			pointerEvents="none"
			style={{
				position: "absolute",
				left: x,
				top: y,
				width: size,
				height: size,
				backgroundColor: "#FFFFFF",
				opacity: twinkle,
				transform: [{ scale: twinkle.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.2] }) }, { rotate: "45deg" }],
			}}
		/>
	);
}

/** The freeze: an ice crystal with a few white sparks that twinkle one after another. */
export default function FreezeCrystal({ size = 18, dimmed = false }: { size?: number; dimmed?: boolean }) {
	return (
		<View style={{ width: size, height: size }}>
			<UiIcon name="diamond" size={size} dimmed={dimmed} />
			{dimmed ? null : (
				<>
					<Spark x={size * 0.05} y={size * 0.1} delay={0} size={Math.max(3, size * 0.2)} />
					<Spark x={size * 0.72} y={size * 0.02} delay={700} size={Math.max(3, size * 0.16)} />
					<Spark x={size * 0.62} y={size * 0.7} delay={1400} size={Math.max(3, size * 0.18)} />
				</>
			)}
		</View>
	);
}
