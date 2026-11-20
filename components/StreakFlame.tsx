import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import UiIcon from "./UiIcon";

/** The streak flame: it breathes and sways like a real one, with a shadow that pulses under it. Size: a multiple of 9. */
export default function StreakFlame({ size = 54, dimmed = false }: { size?: number; dimmed?: boolean }) {
	const breath = useRef(new Animated.Value(0)).current;
	const sway = useRef(new Animated.Value(0)).current;
	useEffect(() => {
		if (dimmed) return;
		const a = Animated.loop(
			Animated.sequence([
				Animated.timing(breath, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
				Animated.timing(breath, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
			])
		);
		const b = Animated.loop(
			Animated.sequence([
				Animated.timing(sway, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
				Animated.timing(sway, { toValue: -1, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
			])
		);
		a.start();
		b.start();
		return () => {
			a.stop();
			b.stop();
		};
	}, [breath, sway, dimmed]);

	return (
		<View style={{ width: size, height: size * 1.25, alignItems: "center", justifyContent: "flex-end" }}>
			<Animated.View
				style={[
					styles.shadow,
					{ width: size * 0.9, height: size * 0.2, borderRadius: size, opacity: dimmed ? 0.1 : breath.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.4] }), transform: [{ scaleX: breath.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.05] }) }] },
				]}
			/>
			<Animated.View
				style={{
					position: "absolute",
					bottom: size * 0.12,
					transformOrigin: "50% 100%",
					transform: [
						{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.09] }) },
						{ rotate: sway.interpolate({ inputRange: [-1, 1], outputRange: ["-3deg", "3deg"] }) },
					],
				}}
			>
				<UiIcon name="fire" size={size} dimmed={dimmed} />
			</Animated.View>
		</View>
	);
}

const styles = StyleSheet.create({
	shadow: {
		backgroundColor: "#FB7185",
	},
});
