import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, ZoomIn } from "react-native-reanimated";
import { useTheme } from "@/constants/Theme";
import { IconName } from "@/constants/chess/PixelIcons";
import { PixelIcon } from "./PixelIcon";

export interface MenuItem {
	key: string;
	label: string;
	icon: IconName;
	onPress: () => void;
}

/**
 * The in-game menu as a card over a dimmed board, like chess.com's: a list of actions with an icon each. Tapping the
 * dimmed area closes it.
 */
export function ChessMenuSheet({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
	const { currentTheme } = useTheme();
	return (
		<Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)} style={local.overlay} testID="chess-menu">
			<Pressable accessibilityLabel="close menu" onPress={onClose} style={StyleSheet.absoluteFill} />
			<Animated.View entering={ZoomIn.duration(170)} style={[local.card, { borderColor: currentTheme.accent }]}>
				{items.map((item, index) => (
					<Pressable
						key={item.key}
						testID={`chess-menu-${item.key}`}
						accessibilityRole="button"
						accessibilityLabel={item.label}
						onPress={() => {
							onClose();
							item.onPress();
						}}
						style={({ pressed }) => [local.row, index > 0 && local.divider, pressed && local.pressed]}
					>
						<PixelIcon name={item.icon} size={24} />
						<Text style={[local.label, { color: currentTheme.textPrimary }]}>{item.label}</Text>
					</Pressable>
				))}
			</Animated.View>
		</Animated.View>
	);
}

const local = StyleSheet.create({
	overlay: { ...StyleSheet.absoluteFillObject, zIndex: 40, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.62)" },
	card: { width: "86%", maxWidth: 300, backgroundColor: "#12121c", borderWidth: 2, borderRadius: 12, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 14 },
	row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 15, paddingHorizontal: 18 },
	divider: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)" },
	pressed: { backgroundColor: "rgba(255,255,255,0.08)" },
	label: { fontFamily: "SilkscreenBold", fontSize: 13, flex: 1 },
});
