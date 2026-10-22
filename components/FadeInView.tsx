import { ReactNode, useEffect, useRef } from "react";
import { Animated, Easing, StyleProp, ViewStyle } from "react-native";

// Fades a block in while it rises a few pixels. Give list items a growing `index` and they appear one after another.
export default function FadeInView({
	children,
	index = 0,
	delay = 0,
	style,
}: {
	children: ReactNode;
	index?: number;
	delay?: number;
	style?: StyleProp<ViewStyle>;
}) {
	const progress = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		const animation = Animated.timing(progress, {
			toValue: 1,
			duration: 320,
			delay: delay + Math.min(index, 8) * 55,
			easing: Easing.out(Easing.cubic),
			useNativeDriver: true,
		});
		animation.start();
		return () => animation.stop();
	}, [progress, index, delay]);

	return (
		<Animated.View style={[style, { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>
			{children}
		</Animated.View>
	);
}
