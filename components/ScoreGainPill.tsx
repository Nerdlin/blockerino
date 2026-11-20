import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text } from "react-native";
import { useSoundSettings } from "@/constants/Sound";

/** "+360": a red pill that pops up over your row, floats up and fades, like the points on Duolingo's league table. */
export default function ScoreGainPill({ gain, onDone }: { gain: number; onDone?: () => void }) {
	const { playSfx } = useSoundSettings();
	const progress = useRef(new Animated.Value(0)).current;
	const pop = useRef(new Animated.Value(0)).current;
	useEffect(() => {
		void playSfx("achievement");
		Animated.spring(pop, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }).start();
		const rise = Animated.timing(progress, { toValue: 1, duration: 2600, delay: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true });
		rise.start(({ finished }) => {
			if (finished) onDone?.();
		});
		return () => rise.stop();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
	return (
		<Animated.View
			pointerEvents="none"
			style={[
				styles.pill,
				{
					opacity: progress.interpolate({ inputRange: [0, 0.1, 0.75, 1], outputRange: [0, 1, 1, 0] }),
					transform: [
						{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -34] }) },
						{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
					],
				},
			]}
		>
			<Text style={styles.text}>+{gain}</Text>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	pill: {
		position: "absolute",
		right: 14,
		top: 6,
		zIndex: 5,
		paddingHorizontal: 12,
		paddingVertical: 5,
		borderRadius: 16,
		borderWidth: 2,
		borderBottomWidth: 4,
		borderColor: "#FFFFFF",
		backgroundColor: "#EF4444",
	},
	text: {
		fontFamily: "SilkscreenBold",
		fontSize: 15,
		color: "#FFFFFF",
	},
});
