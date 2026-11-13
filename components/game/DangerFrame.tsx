import React, { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

/** A red frame pulsing around the board while it is almost full. */
export default function DangerFrame({ active }: { active: boolean }) {
	const glow = useSharedValue(0);

	useEffect(() => {
		if (active) {
			glow.value = withRepeat(withTiming(1, { duration: 520 }), -1, true);
		} else {
			cancelAnimation(glow);
			glow.value = withTiming(0, { duration: 200 });
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [active]);

	const style = useAnimatedStyle(() => ({ opacity: glow.value * 0.9 }));

	return <Animated.View testID="danger-frame" style={[StyleSheet.absoluteFill, styles.frame, style]} />;
}

const styles = StyleSheet.create({
	frame: {
		pointerEvents: "none",
		borderWidth: 3,
		borderColor: "#FF3B3B",
		zIndex: 9998,
	},
});
