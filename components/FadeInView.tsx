import { ReactNode, useEffect, useRef } from "react";
import { Animated, Easing, StyleProp, ViewStyle } from "react-native";

// Fades a block in while it rises a few pixels. Give list items a growing `index` and they appear one after another.
export default function FadeInView({
	children,
	index = 0,
	delay = 0,
	pop = false,
	style,
}: {
	children: ReactNode;
	index?: number;
	delay?: number;
	/** Scale up from a little smaller (with a soft overshoot) instead of rising. */
	pop?: boolean;
	style?: StyleProp<ViewStyle>;
}) {
	const progress = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		const animation = pop
			? Animated.sequence([
				Animated.delay(delay + Math.min(index, 8) * 55),
				Animated.spring(progress, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
			])
			: Animated.timing(progress, {
				toValue: 1,
				duration: 320,
				delay: delay + Math.min(index, 8) * 55,
				easing: Easing.out(Easing.cubic),
				useNativeDriver: true,
			});
		animation.start();
		return () => animation.stop();
	}, [progress, index, delay, pop]);

	return (
		<Animated.View
			style={[
				style,
				{
					opacity: progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
					transform: pop
						? [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }]
						: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
				},
			]}
		>
			{children}
		</Animated.View>
	);
}
