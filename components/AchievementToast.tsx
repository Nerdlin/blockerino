import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
	Easing,
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withSequence,
	withSpring,
	withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import AchievementIcon from "@/components/AchievementIcon";
import { subscribeToAchievementUnlocks } from "@/constants/Achievements";
import { useLanguage } from "@/constants/Localization";
import { useSoundSettings } from "@/constants/Sound";

const VISIBLE_MS = 4200;
const ENTER_OFFSET = -180;
const PARTICLE_COUNT = 10;
const GOLD = "#F5B50C";

function SparkParticle({ index, progress }: { index: number; progress: { value: number } }) {
	const angle = (index / PARTICLE_COUNT) * Math.PI * 2 + (index % 2) * 0.3;
	const distance = 34 + (index % 3) * 14;

	const style = useAnimatedStyle(() => {
		const p = progress.value;
		return {
			opacity: p <= 0 ? 0 : 1 - p,
			transform: [
				{ translateX: Math.cos(angle) * distance * p },
				{ translateY: Math.sin(angle) * distance * p },
				{ scale: 1 - p * 0.6 },
			],
		};
	});

	return <Animated.View pointerEvents="none" style={[styles.particle, index % 2 ? styles.particleLight : null, style]} />;
}

function AchievementToast({ achievementId, onDone }: { achievementId: string; onDone: () => void }) {
	const { t } = useLanguage();
	const { playSfx } = useSoundSettings();
	const insets = useSafeAreaInsets();

	const translateY = useSharedValue(ENTER_OFFSET);
	const iconScale = useSharedValue(0);
	const shine = useSharedValue(0);
	const glow = useSharedValue(0);
	const burst = useSharedValue(0);

	useEffect(() => {
		void playSfx("achievement");
		if (Platform.OS !== "web") {
			void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
		}

		translateY.value = withSequence(
			withSpring(0, { damping: 13, stiffness: 150, mass: 0.9 }),
			withDelay(
				VISIBLE_MS,
				withTiming(ENTER_OFFSET, { duration: 280, easing: Easing.in(Easing.cubic) }, (finished) => {
					if (finished) runOnJS(onDone)();
				})
			)
		);
		iconScale.value = withDelay(
			220,
			withSequence(withSpring(1.3, { damping: 7, stiffness: 220 }), withSpring(1, { damping: 10, stiffness: 180 }))
		);
		shine.value = withDelay(450, withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }));
		glow.value = withSequence(
			withTiming(1, { duration: 450 }),
			withTiming(0.35, { duration: 600 }),
			withTiming(1, { duration: 600 }),
			withTiming(0.35, { duration: 600 }),
			withTiming(0.7, { duration: 900 })
		);
		burst.value = withDelay(280, withTiming(1, { duration: 950, easing: Easing.out(Easing.cubic) }));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const panelStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: translateY.value }],
		shadowOpacity: 0.25 + glow.value * 0.55,
	}));
	const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: iconScale.value }] }));
	const shineStyle = useAnimatedStyle(() => ({
		opacity: shine.value > 0 && shine.value < 1 ? 0.28 : 0,
		transform: [{ translateX: -60 + shine.value * 460 }, { rotate: "20deg" }],
	}));

	return (
		<Animated.View
			pointerEvents="box-none"
			style={[styles.host, { top: Math.max(insets.top, 8) + 8 }, panelStyle]}
		>
			<Pressable onPress={onDone} style={styles.panel} accessibilityRole="alert">
				<View style={styles.shineClip} pointerEvents="none">
					<Animated.View style={[styles.shine, shineStyle]} />
				</View>
				<View style={styles.badge}>
					<Animated.View style={iconStyle}>
						<AchievementIcon achievementId={achievementId} size={36} />
					</Animated.View>
					<View style={styles.particles} pointerEvents="none">
						{Array.from({ length: PARTICLE_COUNT }).map((_, index) => (
							<SparkParticle key={index} index={index} progress={burst} />
						))}
					</View>
				</View>
				<View style={styles.texts}>
					<Text style={styles.kicker} numberOfLines={1}>
						{t("ach.unlocked")}
					</Text>
					<Text style={styles.title} numberOfLines={1}>
						{t(`ach.${achievementId}.title`)}
					</Text>
					<Text style={styles.description} numberOfLines={2}>
						{t(`ach.${achievementId}.unlock`)}
					</Text>
				</View>
			</Pressable>
		</Animated.View>
	);
}

/** Shows a Steam-style banner for every newly unlocked achievement, one at a time. */
export default function AchievementToastHost() {
	const [queue, setQueue] = useState<string[]>([]);
	const [current, setCurrent] = useState<string | null>(null);

	useEffect(
		() =>
			subscribeToAchievementUnlocks((ids) => {
				setQueue((previous) => [...previous, ...ids.filter((id) => !previous.includes(id))]);
			}),
		[]
	);

	useEffect(() => {
		if (current === null && queue.length > 0) {
			setCurrent(queue[0]);
			setQueue((previous) => previous.slice(1));
		}
	}, [current, queue]);

	if (current === null) return null;

	return <AchievementToast key={current} achievementId={current} onDone={() => setCurrent(null)} />;
}

const styles = StyleSheet.create({
	host: {
		position: "absolute",
		left: 12,
		right: 12,
		alignItems: "center",
		zIndex: 10000,
		elevation: 10000,
		shadowColor: GOLD,
		shadowOffset: { width: 0, height: 0 },
		shadowRadius: 18,
	},
	panel: {
		width: "100%",
		maxWidth: 420,
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingVertical: 10,
		paddingHorizontal: 12,
		backgroundColor: "#0B0817",
		borderColor: GOLD,
		borderWidth: 2,
		borderRadius: 6,
		overflow: "hidden",
	},
	shineClip: {
		...StyleSheet.absoluteFillObject,
		overflow: "hidden",
	},
	shine: {
		position: "absolute",
		top: -20,
		bottom: -20,
		width: 36,
		backgroundColor: "#FFFFFF",
	},
	badge: {
		width: 52,
		height: 52,
		borderRadius: 4,
		borderWidth: 2,
		borderColor: GOLD,
		backgroundColor: "rgba(245, 181, 12, 0.14)",
		alignItems: "center",
		justifyContent: "center",
	},
	particles: {
		...StyleSheet.absoluteFillObject,
		alignItems: "center",
		justifyContent: "center",
	},
	particle: {
		position: "absolute",
		width: 5,
		height: 5,
		backgroundColor: GOLD,
	},
	particleLight: {
		backgroundColor: "#FFF3B0",
	},
	texts: {
		flex: 1,
		minWidth: 0,
		gap: 3,
	},
	kicker: {
		fontFamily: "Silkscreen",
		fontSize: 10,
		letterSpacing: 1,
		color: GOLD,
	},
	title: {
		fontFamily: "SilkscreenBold",
		fontSize: 15,
		color: "#FFFFFF",
	},
	description: {
		fontFamily: "Silkscreen",
		fontSize: 9,
		lineHeight: 12,
		color: "#9CA3AF",
	},
});
