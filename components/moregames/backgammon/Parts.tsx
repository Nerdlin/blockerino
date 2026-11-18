import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import type { Side } from "../../../constants/backgammon/Rules";
import { BACKGAMMON_SKINS, tone } from "../cosmetics";

export type BackgammonSkin = (typeof BACKGAMMON_SKINS)[keyof typeof BACKGAMMON_SKINS];

/** A checker: a round chip with a lit top-left rim and a shaded bottom-right one, like a game block. */
export function Checker({ side, d, skin, rim, rimWidth = 2 }: { side: Side; d: number; skin: BackgammonSkin; rim?: string; rimWidth?: number }) {
	const colors = side === "w" ? skin.white : skin.black;
	return (
		<View
			style={[
				local.checker,
				{
					width: d,
					height: d,
					borderRadius: d / 2,
					backgroundColor: colors.fill,
					borderWidth: rimWidth,
					...(rim ? { borderColor: rim } : { borderTopColor: tone(colors.fill, 0.45), borderLeftColor: tone(colors.fill, 0.3), borderBottomColor: colors.rim, borderRightColor: colors.rim }),
				},
				skin.glow && { shadowColor: colors.fill, shadowOpacity: 0.9, shadowRadius: d * 0.18, elevation: 6 },
			]}
		>
			<View style={{ width: d * 0.5, height: d * 0.5, borderRadius: d * 0.25, borderWidth: 1.5, borderColor: colors.rim }} />
		</View>
	);
}

/** A checker sliding from one spot of the board to another. */
export function SlideChecker({ side, d, skin, from, to, ms, onDone }: { side: Side; d: number; skin: BackgammonSkin; from: { x: number; y: number }; to: { x: number; y: number }; ms: number; onDone: () => void }) {
	const position = useRef(new Animated.ValueXY(from)).current;
	useEffect(() => {
		let stopped = false;
		Animated.timing(position, { toValue: to, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: false }).start(({ finished }) => {
			if (finished && !stopped) onDone();
		});
		return () => {
			stopped = true;
			position.stopAnimation();
		};
		// one run per slide (the overlay is keyed by the slide's id)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
	return (
		<Animated.View pointerEvents="none" style={{ position: "absolute", left: position.x, top: position.y, width: d, height: d, zIndex: 8 }}>
			<Checker side={side} d={d} skin={skin} />
		</Animated.View>
	);
}

/** The strip where a side's borne-off checkers pile up; lit and pressable while a checker can be borne off into it. */
export function Tray({ side, count, skin, width, active, label, countLabel, onPress, testID }: {
	side: Side;
	count: number;
	skin: BackgammonSkin;
	width: number;
	active: boolean;
	label: string;
	countLabel: string;
	onPress?: () => void;
	testID?: string;
}) {
	const slot = width / 15;
	const colors = side === "w" ? skin.white : skin.black;
	const chip = Math.max(8, Math.min(16, slot - 6));
	return (
		<Pressable
			testID={testID}
			accessibilityLabel={countLabel}
			disabled={!active}
			onPress={onPress}
			style={[local.tray, { width, borderColor: active ? "#4ADE80" : skin.frame, backgroundColor: active ? "rgba(74,222,128,0.18)" : "rgba(0,0,0,0.25)" }]}
		>
			{Array.from({ length: 15 }, (_, index) => (
				<View key={index} style={{ width: slot, alignItems: "center" }}>
					<View
						style={{
							width: chip,
							height: chip,
							borderRadius: chip / 2,
							borderWidth: 2,
							borderColor: index < count ? colors.rim : "rgba(255,255,255,0.14)",
							backgroundColor: index < count ? colors.fill : "transparent",
						}}
					/>
				</View>
			))}
			{active ? (
				<View pointerEvents="none" style={local.trayLabel}>
					<Text style={local.trayLabelText}>{label}</Text>
				</View>
			) : null}
		</Pressable>
	);
}

const local = StyleSheet.create({
	checker: { alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 2, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
	tray: { height: 22, flexDirection: "row", alignItems: "center", borderWidth: 2, borderRadius: 4 },
	trayLabel: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.45)" },
	trayLabelText: { fontFamily: "SilkscreenBold", fontSize: 11, color: "#4ADE80" },
});
