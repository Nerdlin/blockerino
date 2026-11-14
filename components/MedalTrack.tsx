import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, ZoomIn, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import PixelMedal, { PixelMedalKind } from "./PixelMedal";

export interface TrackMedal {
	id: PixelMedalKind;
	score: number;
}

const FILL: Record<PixelMedalKind, string> = { bronze: "#D08A45", silver: "#C9D1D9", gold: "#FFD23F" };

/**
 * The medals of a mode as a path: start ═══ bronze ═══ silver ═══ gold. Each stretch fills with the score reached on
 * the way to its medal, earned medals pop in one after another and the next one pulses.
 */
export default function MedalTrack({ medals, score, size = 36 }: { medals: TrackMedal[]; score: number; size?: number }) {
	const nextIndex = medals.findIndex((m) => score < m.score);
	return (
		<View style={styles.track}>
			{medals.map((m, i) => {
				const from = i === 0 ? 0 : medals[i - 1].score;
				const fill = Math.max(0, Math.min(1, (score - from) / Math.max(1, m.score - from)));
				const earned = score >= m.score;
				return (
					<View key={m.id} style={styles.step}>
						<Stretch fill={fill} color={FILL[m.id]} delay={150 + i * 350} top={Math.round(3 + size * 1.25 * 0.7 - 5)} />
						<MedalSlot medal={m} earned={earned} next={i === nextIndex} size={size} delay={350 + i * 350} />
					</View>
				);
			})}
		</View>
	);
}

/** One stretch of the path, a pixel bar that fills up to the medal. */
function Stretch({ fill, color, delay, top }: { fill: number; color: string; delay: number; top: number }) {
	return (
		<View style={[styles.stretch, { marginTop: top }]}>
			{fill > 0 && <Animated.View entering={FadeIn.delay(delay).duration(400)} style={[styles.stretchFill, { backgroundColor: color, width: `${Math.round(fill * 100)}%` }]} />}
		</View>
	);
}

function MedalSlot({ medal, earned, next, size, delay }: { medal: TrackMedal; earned: boolean; next: boolean; size: number; delay: number }) {
	// earned medals pop in one after another (an entering animation); the next one pulses
	const scale = useSharedValue(1);
	useEffect(() => {
		if (next) scale.value = withDelay(delay, withRepeat(withSequence(withTiming(1.12, { duration: 520 }), withTiming(1, { duration: 520 })), -1));
	}, [next, delay, scale]);
	const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
	return (
		<View style={styles.slot}>
			<Animated.View style={[styles.medal, next && styles.medalNext, style]}>
				{earned ? (
					<Animated.View entering={ZoomIn.delay(delay).springify().damping(9)}>
						<PixelMedal kind={medal.id} size={size} />
					</Animated.View>
				) : (
					<PixelMedal kind={medal.id} size={size} locked />
				)}
			</Animated.View>
			<Text style={[styles.score, { color: earned ? FILL[medal.id] : next ? "#E5E7EB" : "#6B7280" }]}>{medal.score}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	track: {
		flexDirection: "row",
		alignItems: "flex-start",
		alignSelf: "stretch",
	},
	step: {
		flex: 1,
		flexDirection: "row",
		alignItems: "flex-start",
	},
	stretch: {
		flex: 1,
		height: 10,
		marginHorizontal: 4,
		backgroundColor: "rgba(255,255,255,0.08)",
		borderWidth: 2,
		borderColor: "rgba(0,0,0,0.55)",
		overflow: "hidden",
	},
	stretchFill: {
		height: "100%",
	},
	slot: {
		alignItems: "center",
		gap: 4,
	},
	medal: {
		padding: 3,
		borderRadius: 8,
	},
	medalNext: {
		backgroundColor: "rgba(255,255,255,0.06)",
	},
	score: {
		fontFamily: "Silkscreen",
		fontSize: 11,
	},
});
