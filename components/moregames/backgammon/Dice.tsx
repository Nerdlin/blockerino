import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import { pixelTile } from "../cosmetics";

/** Which of the nine cells of a die's face carry a pip. */
export const DIE_PIPS: Record<number, number[]> = {
	1: [4],
	2: [0, 8],
	3: [0, 4, 8],
	4: [0, 2, 6, 8],
	5: [0, 2, 4, 6, 8],
	6: [0, 2, 3, 5, 6, 8],
};

export function PixelDie({ value, size, dim, pixel = true }: { value: number | null; size: number; dim?: boolean; pixel?: boolean }) {
	const face = "#F8FAFC";
	const pip = Math.max(3, Math.round(size * 0.17));
	const pad = Math.round(size * 0.14);
	const pips = value ? DIE_PIPS[value] ?? [] : [];
	const cell = (size - pad * 2 - 4) / 3;
	return (
		<View style={[local.die, { width: size, height: size, borderRadius: Math.round(size * 0.14), backgroundColor: face, opacity: dim ? 0.35 : 1 }, pixel && pixelTile(face, size)]}>
			{pips.map((index) => (
				<View
					key={index}
					style={{
						position: "absolute",
						left: pad + (index % 3) * cell + (cell - pip) / 2,
						top: pad + Math.floor(index / 3) * cell + (cell - pip) / 2,
						width: pip,
						height: pip,
						borderRadius: pixel ? 0 : pip / 2,
						backgroundColor: value === 1 ? "#DC2626" : "#111827",
					}}
				/>
			))}
		</View>
	);
}

/**
 * The two dice. While `rolling` they tumble through random faces and bounce; they settle on the rolled values. A die
 * already played shows dim, and a double says how many of its four are left.
 */
export function Dice({ dice, rolling, remaining, size, rollMs, pixel = true }: { dice: [number, number] | null; rolling: boolean; remaining: number[]; size: number; rollMs: number; pixel?: boolean }) {
	const [faces, setFaces] = useState<[number, number]>([1, 1]);
	const tumble = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		if (!rolling) {
			tumble.setValue(0);
			return;
		}
		const timer = setInterval(() => setFaces([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]), 70);
		tumble.setValue(0);
		Animated.timing(tumble, { toValue: 1, duration: rollMs, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== "web" }).start();
		return () => clearInterval(timer);
	}, [rolling, rollMs, tumble]);

	const double = dice !== null && dice[0] === dice[1];
	const used = (index: 0 | 1) => {
		if (!dice) return false;
		if (double) return remaining.length === 0;
		return !remaining.includes(dice[index]);
	};
	const spins = [
		tumble.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "540deg"] }),
		tumble.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-450deg"] }),
	];
	const bounce = tumble.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, -size * 0.45, 0, -size * 0.15, 0] });
	const shown = rolling ? faces : dice;
	return (
		<View style={local.row} accessibilityLabel={dice ? `${dice[0]} ${dice[1]}` : undefined}>
			{([0, 1] as const).map((index) => (
				<Animated.View key={index} style={rolling ? { transform: [{ translateY: bounce }, { rotate: spins[index] }] } : undefined}>
					<PixelDie pixel={pixel} value={shown ? shown[index] : null} size={size} dim={!rolling && (dice === null || used(index))} />
				</Animated.View>
			))}
			{double && !rolling && remaining.length > 0 ? <Text style={local.times}>{`×${remaining.length}`}</Text> : null}
		</View>
	);
}

const local = StyleSheet.create({
	die: { alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 2, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
	row: { flexDirection: "row", alignItems: "center", gap: 10 },
	times: { fontFamily: "SilkscreenBold", fontSize: 14, color: "#FACC15" },
});
