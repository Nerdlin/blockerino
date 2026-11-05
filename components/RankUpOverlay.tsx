import { useEffect, useRef } from "react";
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import UiIcon from "./UiIcon";
import type { UiGlyphName } from "@/constants/UiGlyphs";
import { useLanguage } from "@/constants/Localization";
import { useSoundSettings } from "@/constants/Sound";

export interface RankUpTier {
	tier: string;
	color: string;
	icon: UiGlyphName;
}

const SPARKS = 14;

// A new Versus rank: the medal drops in and bounces, a ring pulses in the rank's colour and pixel sparks fly out.
export default function RankUpOverlay({ tier, elo, onClose }: { tier: RankUpTier; elo: number; onClose: () => void }) {
	const { t } = useLanguage();
	const { playSfx } = useSoundSettings();
	const backdrop = useRef(new Animated.Value(0)).current;
	const medal = useRef(new Animated.Value(0)).current;
	const ring = useRef(new Animated.Value(0)).current;
	const sparks = useRef(new Animated.Value(0)).current;
	const text = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		void playSfx("achievement");
		if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
		Animated.sequence([
			Animated.timing(backdrop, { toValue: 1, duration: 220, useNativeDriver: true }),
			Animated.parallel([
				Animated.spring(medal, { toValue: 1, friction: 4, tension: 90, useNativeDriver: true }),
				Animated.timing(sparks, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
				Animated.timing(text, { toValue: 1, duration: 420, delay: 260, useNativeDriver: true }),
			]),
		]).start();
		const pulse = Animated.loop(Animated.sequence([
			Animated.timing(ring, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
			Animated.timing(ring, { toValue: 0, duration: 0, useNativeDriver: true }),
		]));
		pulse.start();
		return () => pulse.stop();
	}, [backdrop, medal, playSfx, ring, sparks, text]);

	const tierName = t(`mp.tierName.${tier.tier}`);
	return (
		<Modal transparent animationType="none" visible onRequestClose={onClose}>
			<Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
				<Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
				<View style={styles.stage} pointerEvents="none">
					{Array.from({ length: SPARKS }, (_, i) => {
						const angle = (i / SPARKS) * Math.PI * 2;
						const distance = 110 + (i % 3) * 22;
						return (
							<Animated.View
								key={i}
								style={[styles.spark, {
									backgroundColor: i % 2 === 0 ? tier.color : "#FFFFFF",
									opacity: sparks.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
									transform: [
										{ translateX: sparks.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * distance] }) },
										{ translateY: sparks.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * distance] }) },
									],
								}]}
							/>
						);
					})}
					<Animated.View style={[styles.ring, {
						borderColor: tier.color,
						opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
						transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
					}]} />
					<Animated.View style={[styles.medal, {
						borderColor: tier.color,
						shadowColor: tier.color,
						transform: [
							{ scale: medal.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) },
							{ rotate: medal.interpolate({ inputRange: [0, 1], outputRange: ["-25deg", "0deg"] }) },
						],
					}]}>
						<UiIcon name={tier.icon} size={81} />
					</Animated.View>
				</View>
				<Animated.View style={[styles.texts, { opacity: text, transform: [{ translateY: text.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>
					<Text style={styles.kicker}>{t("mp.rankUpTitle")}</Text>
					<Text style={[styles.tierName, { color: tier.color }]}>{tierName}</Text>
					<Text style={styles.rating}>{t("mp.rankUpRating", { elo })}</Text>
					<Pressable onPress={onClose} style={[styles.button, { backgroundColor: tier.color }]}>
						<Text style={styles.buttonText}>{t("mp.rankUpOk")}</Text>
					</Pressable>
				</Animated.View>
			</Animated.View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: { flex: 1, backgroundColor: "rgba(4, 3, 10, 0.95)", alignItems: "center", justifyContent: "center", gap: 28 },
	stage: { width: 260, height: 220, alignItems: "center", justifyContent: "center" },
	spark: { position: "absolute", width: 10, height: 10 },
	ring: { position: "absolute", width: 150, height: 150, borderRadius: 75, borderWidth: 4 },
	medal: {
		width: 150,
		height: 150,
		borderRadius: 75,
		borderWidth: 4,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(255,255,255,0.06)",
		shadowOpacity: 0.9,
		shadowRadius: 24,
		shadowOffset: { width: 0, height: 0 },
		elevation: 12,
	},
	texts: { alignItems: "center", gap: 8, paddingHorizontal: 24 },
	kicker: { fontFamily: "Silkscreen", fontSize: 14, color: "#E5E7EB", letterSpacing: 2 },
	tierName: { fontFamily: "SilkscreenBold", fontSize: 34, textAlign: "center" },
	rating: { fontFamily: "Silkscreen", fontSize: 12, color: "#9CA3AF" },
	button: { marginTop: 14, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 10 },
	buttonText: { fontFamily: "SilkscreenBold", fontSize: 14, color: "#111827" },
});
