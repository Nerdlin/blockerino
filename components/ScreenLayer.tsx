import { StyleSheet } from "react-native";
import Animated, { FadeOut } from "react-native-reanimated";

/**
 * Holds one menu screen so it fades out when it closes (screens fade in by themselves, SimplePopupView). It covers the
 * window and centres the screen as the root did, and lets touches through where the screen is not.
 */
export default function ScreenLayer({ children }: { children: React.ReactNode }) {
	return (
		<Animated.View pointerEvents="box-none" exiting={FadeOut.duration(170)} style={styles.layer}>
			{children}
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	layer: {
		...StyleSheet.absoluteFillObject,
		alignItems: "center",
		justifyContent: "center",
		zIndex: 100,
	},
});
