import { useEffect, useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { Easing, SharedValue, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from "react-native-reanimated";
import { useAtomValue } from "jotai";
import { activeComboAtom } from "@/hooks/useAppState";
import { getBackgroundScene, type BackgroundScene as SceneId } from "@/constants/Shop";

// The living layer of a background: every scene moves in its own way (the classic one keeps its falling pieces,
// drawn elsewhere). Calm and dim during a game, livelier on a combo.

function seeded(i: number, salt: number): number {
	const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
	return v - Math.floor(v);
}

/** One looping value 0 -> 1 per particle, started with its own delay. */
function useLoop(duration: number, delay: number, speed: number): SharedValue<number> {
	const t = useSharedValue(0);
	useEffect(() => {
		cancelAnimation(t);
		t.value = 0;
		t.value = withDelay(delay, withRepeat(withTiming(1, { duration: duration / speed, easing: Easing.linear }), -1, false));
		return () => cancelAnimation(t);
	}, [delay, duration, speed, t]);
	return t;
}

function Mote({ i, w, h, color, speed, dim }: { i: number; w: number; h: number; color: string; speed: number; dim: number }) {
	// ender: glowing motes rising and twinkling
	const t = useLoop(9000 + seeded(i, 1) * 7000, seeded(i, 2) * 6000, speed);
	const x0 = seeded(i, 3) * w;
	const size = 3 + seeded(i, 4) * 5;
	const style = useAnimatedStyle(() => ({
		transform: [{ translateX: x0 + Math.sin(t.value * Math.PI * 2 + i) * 18 }, { translateY: h - t.value * (h + 40) }],
		opacity: dim * (0.3 + 0.7 * Math.abs(Math.sin(t.value * Math.PI * 3 + i))),
	}));
	return <Animated.View style={[styles.dot, { width: size, height: size, borderRadius: size, backgroundColor: color, boxShadow: `0 0 ${size * 2}px ${color}` }, style]} />;
}

function Ember({ i, w, h, speed, dim }: { i: number; w: number; h: number; speed: number; dim: number }) {
	// sunset: embers drifting up from the bottom, fading out
	const t = useLoop(6000 + seeded(i, 5) * 5000, seeded(i, 6) * 5000, speed);
	const x0 = seeded(i, 7) * w;
	const size = 2 + seeded(i, 8) * 3;
	const style = useAnimatedStyle(() => ({
		transform: [{ translateX: x0 + Math.sin(t.value * 6 + i) * 10 }, { translateY: h - t.value * h * 0.7 }],
		opacity: dim * (1 - t.value) * 0.9,
	}));
	return <Animated.View style={[styles.dot, { width: size, height: size, borderRadius: size, backgroundColor: "#FFB347" }, style]} />;
}

function Flake({ i, w, h, speed, dim }: { i: number; w: number; h: number; speed: number; dim: number }) {
	// ice: snow falling with a sway
	const t = useLoop(8000 + seeded(i, 9) * 8000, seeded(i, 10) * 8000, speed);
	const x0 = seeded(i, 11) * w;
	const size = 2 + seeded(i, 12) * 4;
	const style = useAnimatedStyle(() => ({
		transform: [{ translateX: x0 + Math.sin(t.value * Math.PI * 4 + i) * 22 }, { translateY: -20 + t.value * (h + 40) }],
		opacity: dim * 0.85,
	}));
	return <Animated.View style={[styles.dot, { width: size, height: size, borderRadius: size, backgroundColor: "#F0F9FF" }, style]} />;
}

function SunGlow({ w, h, accent, speed, dim }: { w: number; h: number; accent: string; speed: number; dim: number }) {
	const t = useLoop(7000, 0, speed);
	const size = Math.min(w, h) * 0.75;
	const style = useAnimatedStyle(() => ({
		opacity: dim * (0.12 + 0.05 * Math.sin(t.value * Math.PI * 2)),
		transform: [{ scale: 1 + 0.05 * Math.sin(t.value * Math.PI * 2) }],
	}));
	return <Animated.View style={[styles.dot, { left: (w - size) / 2, top: h * 0.55, width: size, height: size, borderRadius: size, backgroundColor: accent, boxShadow: `0 0 ${size * 0.4}px ${accent}` }, style]} />;
}

function Aurora({ w, h, accent, speed, dim }: { w: number; h: number; accent: string; speed: number; dim: number }) {
	const t = useLoop(14000, 0, speed);
	const style = useAnimatedStyle(() => ({
		opacity: dim * (0.07 + 0.05 * Math.sin(t.value * Math.PI * 2)),
		transform: [{ translateX: Math.sin(t.value * Math.PI * 2) * w * 0.15 }, { rotate: `${-8 + 6 * Math.sin(t.value * Math.PI * 2)}deg` }],
	}));
	return <Animated.View style={[styles.dot, { left: -w * 0.25, top: h * 0.12, width: w * 1.5, height: h * 0.16, borderRadius: h, backgroundColor: accent, boxShadow: `0 0 ${h * 0.12}px ${accent}` }, style]} />;
}

function CyberGrid({ w, h, accent, speed, dim }: { w: number; h: number; accent: string; speed: number; dim: number }) {
	// neon grid lines sliding down and a scanline sweeping the screen
	const t = useLoop(4000, 0, speed);
	const scan = useLoop(6000, 0, speed);
	const gap = 48;
	const rows = Math.ceil(h / gap) + 2;
	const gridStyle = useAnimatedStyle(() => ({ transform: [{ translateY: t.value * gap }], opacity: dim * 0.18 }));
	const scanStyle = useAnimatedStyle(() => ({ transform: [{ translateY: scan.value * h }], opacity: dim * 0.25 }));
	const cols = Math.ceil(w / gap) + 1;
	return (
		<>
			<Animated.View style={[StyleSheet.absoluteFill, { top: -gap }, gridStyle]}>
				{Array.from({ length: rows }, (_, r) => <View key={`r${r}`} style={[styles.line, { top: r * gap, width: w, height: 1, backgroundColor: accent }]} />)}
				{Array.from({ length: cols }, (_, c) => <View key={`c${c}`} style={[styles.line, { left: c * gap, height: h + gap * 2, width: 1, backgroundColor: accent }]} />)}
			</Animated.View>
			<Animated.View style={[styles.line, { top: 0, width: w, height: 3, backgroundColor: accent, boxShadow: `0 0 12px ${accent}` }, scanStyle]} />
		</>
	);
}

export default function BackgroundSceneLayer({ backgroundId, accent, isGameplayActive }: { backgroundId: string; accent: string; isGameplayActive: boolean }) {
	const { width: w, height: h } = useWindowDimensions();
	const combo = useAtomValue(activeComboAtom);
	const scene: SceneId = getBackgroundScene(backgroundId);
	// livelier on a combo; calm under a game
	const speed = isGameplayActive ? 0.6 : 1 + Math.min(combo, 6) * 0.25;
	const dim = isGameplayActive ? 0.45 : 1;
	const count = isGameplayActive ? 8 : 18;
	const ids = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);

	if (scene === "classic") return null;
	return (
		<View style={styles.layer} pointerEvents="none">
			{scene === "ender" && ids.map((i) => <Mote key={i} i={i} w={w} h={h} color={accent} speed={speed} dim={dim} />)}
			{scene === "sunset" && <SunGlow w={w} h={h} accent={accent} speed={speed} dim={dim} />}
			{scene === "sunset" && ids.map((i) => <Ember key={i} i={i} w={w} h={h} speed={speed} dim={dim} />)}
			{scene === "ice" && <Aurora w={w} h={h} accent={accent} speed={speed} dim={dim} />}
			{scene === "ice" && ids.map((i) => <Flake key={i} i={i} w={w} h={h} speed={speed} dim={dim} />)}
			{scene === "cyber" && <CyberGrid w={w} h={h} accent={accent} speed={speed} dim={dim} />}
		</View>
	);
}

const styles = StyleSheet.create({
	layer: {
		...StyleSheet.absoluteFillObject,
		overflow: "hidden",
		zIndex: 0,
	},
	dot: {
		position: "absolute",
		left: 0,
		top: 0,
	},
	line: {
		position: "absolute",
		left: 0,
	},
});
