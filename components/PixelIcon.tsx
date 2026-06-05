import { StyleSheet, View } from "react-native";

type PixelIconName = "medal" | "gear" | "crown";

const ICONS: Record<PixelIconName, string[]> = {
	medal: [
		"0220220",
		"0022200",
		"0111110",
		"1112111",
		"1111111",
		"0111110",
		"0011100",
	],
	gear: [
		"1010101",
		"1111111",
		"0111110",
		"1110111",
		"0111110",
		"1111111",
		"1010101",
	],
	crown: [
		"1000001",
		"1101011",
		"1111111",
		"0111110",
		"0111110",
		"1111111",
		"0111110",
	],
};

interface PixelIconProps {
	name: PixelIconName;
	size?: number;
	color?: string;
	secondaryColor?: string;
	backgroundColor?: string;
}

export default function PixelIcon({
	name,
	size = 28,
	color = "#F0AF0C",
	secondaryColor = "#FFFFFF",
	backgroundColor = "transparent",
}: PixelIconProps) {
	const pattern = ICONS[name];
	const cellSize = size / pattern.length;

	return (
		<View style={[styles.icon, { width: size, height: size, backgroundColor }]}>
			{pattern.map((row, y) => row.split("").map((cell, x) => (
				<View
					key={`${name}-${x}-${y}`}
					style={[
						styles.pixel,
						{
							width: cellSize,
							height: cellSize,
							left: x * cellSize,
							top: y * cellSize,
							backgroundColor: cell === "2" ? secondaryColor : color,
							opacity: cell === "0" ? 0 : 1,
						},
					]}
				/>
			)))}
		</View>
	);
}

const styles = StyleSheet.create({
	icon: {
		position: "relative",
	},
	pixel: {
		position: "absolute",
	},
});
