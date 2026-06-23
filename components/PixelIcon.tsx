import { StyleSheet, View } from "react-native";

type PixelIconName = "medal" | "gear" | "crown" | "skull" | "heart" | "coin" | "face-happy" | "face-sad" | "fire" | "star" | "bomb" | "shield" | "sword" | "diamond" | "ghost" | "alien";

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
	skull: [
		"0111110",
		"1001001",
		"1001001",
		"1111111",
		"0101010",
		"0111110",
		"0000000",
	],
	heart: [
		"0110110",
		"1111111",
		"1111111",
		"0111110",
		"0011100",
		"0001000",
		"0000000",
	],
	coin: [
		"0011100",
		"0122210",
		"1211121",
		"1211121",
		"1211121",
		"0122210",
		"0011100",
	],
	"face-happy": [
		"0111110",
		"1011101",
		"1111111",
		"1000001",
		"1100011",
		"0111110",
		"0000000",
	],
	"face-sad": [
		"0111110",
		"1011101",
		"1111111",
		"1100011",
		"1000001",
		"0111110",
		"0000000",
	],
	fire: [
		"0001000",
		"0011000",
		"0111100",
		"1111110",
		"1112111",
		"0111110",
		"0011100",
	],
	star: [
		"0001000",
		"0011100",
		"1111111",
		"0111110",
		"0011100",
		"0110110",
		"1000001",
	],
	bomb: [
		"0000100",
		"0001000",
		"0011100",
		"0111110",
		"0111110",
		"0011100",
		"0000000",
	],
	shield: [
		"1111111",
		"1111111",
		"1111111",
		"0111110",
		"0011100",
		"0001000",
		"0000000",
	],
	sword: [
		"0000001",
		"0000011",
		"0000110",
		"0001100",
		"0111000",
		"1110000",
		"0100000",
	],
	diamond: [
		"0000000",
		"0011100",
		"0111110",
		"1111111",
		"0111110",
		"0011100",
		"0001000",
	],
	ghost: [
		"0011100",
		"0111110",
		"1011101",
		"1111111",
		"1111111",
		"1111111",
		"1010101",
	],
	alien: [
		"0011100",
		"0111110",
		"1011101",
		"1111111",
		"0110110",
		"0011100",
		"0001000",
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
	const pattern = ICONS[name] || ICONS["face-happy"] || ["1"];
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
