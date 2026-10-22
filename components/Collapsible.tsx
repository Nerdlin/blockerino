import { ReactNode, useEffect, useRef, useState } from "react";
import { Animated, Easing, LayoutChangeEvent, View } from "react-native";

// Slides a block open or closed (height and opacity) instead of making it pop in and out. The content stays mounted
// while it is closing so the animation can finish, and is removed afterwards so it takes no part in layout.
export default function Collapsible({
	visible,
	children,
	duration = 260,
}: {
	visible: boolean;
	children: ReactNode;
	duration?: number;
}) {
	const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
	const [measured, setMeasured] = useState<number | null>(null);
	const [mounted, setMounted] = useState(visible);

	useEffect(() => {
		if (visible) setMounted(true);
		const animation = Animated.timing(progress, {
			toValue: visible ? 1 : 0,
			duration,
			easing: Easing.out(Easing.cubic),
			// height cannot use the native driver
			useNativeDriver: false,
		});
		animation.start(({ finished }) => {
			if (finished && !visible) setMounted(false);
		});
		return () => animation.stop();
	}, [visible, duration, progress]);

	const onLayout = (event: LayoutChangeEvent) => {
		const height = event.nativeEvent.layout.height;
		if (height > 0 && height !== measured) setMeasured(height);
	};

	if (!mounted) return null;

	// Until the content has been measured it lays out freely; afterwards the wrapper's height follows the animation.
	const animatedStyle = measured === null
		? { opacity: progress, width: "100%" as const }
		: {
			opacity: progress,
			height: progress.interpolate({ inputRange: [0, 1], outputRange: [0, measured] }),
			overflow: "hidden" as const,
			width: "100%" as const,
		};

	return (
		<Animated.View style={animatedStyle}>
			<View onLayout={onLayout} style={{ position: measured === null ? "relative" : "absolute", left: 0, right: 0, top: 0 }}>
				{children}
			</View>
		</Animated.View>
	);
}
