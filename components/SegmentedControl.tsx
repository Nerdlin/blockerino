import { Pressable, StyleSheet, Text, View } from "react-native";
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

	return (
		<View style={styles.bar}>
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
							selected && { backgroundColor: item.color ?? currentTheme.buttonPrimary },
						]}
					>
						<Text style={[styles.label, small ? styles.labelSmall : styles.labelLarge, selected ? styles.labelSelected : styles.labelIdle]}>
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
	segment: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 4,
	},
	segmentLarge: {
		height: 44,
	},
	segmentSmall: {
		height: 34,
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
