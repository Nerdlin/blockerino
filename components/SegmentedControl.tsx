import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useTheme } from "@/constants/Theme";

export interface SegmentItem<T extends string> {
	key: T;
	label: string;
	/** Fill of the selected segment; defaults to the theme's primary button colour. */
	color?: string;
}

// One bar with a few options instead of a row of separate buttons: calmer to look at and easier to scan.
export default function SegmentedControl<T extends string>({
	items,
	value,
	onChange,
	small = false,
}: {
	items: SegmentItem<T>[];
	value: T;
	onChange: (key: T) => void;
	small?: boolean;
}) {
	const { currentTheme } = useTheme();
	// the fill slides to the chosen segment instead of jumping (the segments share the bar's width equally)
	const [width, setWidth] = useState(0);
	const index = Math.max(0, items.findIndex((item) => item.key === value));
	const color = items[index]?.color ?? currentTheme.buttonPrimary;
	const slot = items.length > 0 ? width / items.length : 0;
	const x = useSharedValue(0);
	const placed = useSharedValue(false);
	useEffect(() => {
		if (slot <= 0) return;
		if (!placed.value) {
			x.value = index * slot;
			placed.value = true;
		} else {
			x.value = withTiming(index * slot, { duration: 220, easing: Easing.out(Easing.cubic) });
		}
	}, [index, slot, x, placed]);
	const fillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
	const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width - 4);

	return (
		<View style={styles.bar} onLayout={onLayout}>
			{slot > 0 && <Animated.View pointerEvents="none" style={[styles.fill, { width: slot, backgroundColor: color }, fillStyle]} />}
			{items.map((item, index) => {
				const selected = item.key === value;
				return (
					<Pressable
						key={item.key}
						onPress={() => onChange(item.key)}
						accessibilityRole="button"
						accessibilityState={{ selected }}
						style={[
							styles.segment,
							small ? styles.segmentSmall : styles.segmentLarge,
							index > 0 && styles.divider,
							// until the bar is measured the chosen segment paints itself
							selected && slot <= 0 && { backgroundColor: item.color ?? currentTheme.buttonPrimary },
						]}
					>
						{/* several words may take two lines; one word only shrinks a little (a word is never split) */}
						<Text android_hyphenationFrequency="none" numberOfLines={item.label.includes(" ") ? 2 : 1} adjustsFontSizeToFit minimumFontScale={item.label.includes(" ") ? 0.85 : 0.7} style={[styles.label, small ? styles.labelSmall : styles.labelLarge, selected ? styles.labelSelected : styles.labelIdle]}>
							{item.label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	bar: {
		flexDirection: "row",
		width: "92%",
		maxWidth: 420,
		borderWidth: 2,
		borderColor: "rgba(255, 255, 255, 0.25)",
		borderRadius: 10,
		overflow: "hidden",
	},
	fill: {
		position: "absolute",
		top: 0,
		bottom: 0,
		left: 0,
	},
	segment: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 4,
	},
	segmentLarge: {
		minHeight: 44,
		paddingVertical: 4,
	},
	segmentSmall: {
		minHeight: 34,
		paddingVertical: 3,
	},
	divider: {
		borderLeftWidth: 1,
		borderLeftColor: "rgba(255, 255, 255, 0.18)",
	},
	label: {
		fontFamily: "Silkscreen",
		textAlign: "center",
	},
	labelLarge: {
		fontSize: 14,
	},
	labelSmall: {
		fontSize: 11,
	},
	labelSelected: {
		color: "#FFFFFF",
	},
	labelIdle: {
		color: "rgba(255, 255, 255, 0.65)",
	},
});
