import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Path } from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAtomValue } from "jotai";
import StylizedButton from "./StylizedButton";
import UiIcon from "./UiIcon";
import FadeInView from "./FadeInView";
import { CountUp, withAlpha } from "./ProfileDesign";
import { dailyRewardOpenAtom } from "@/constants/DailyReward";
import { useAppState } from "@/hooks/useAppState";
import { useLanguage } from "@/constants/Localization";
import { useSoundSettings } from "@/constants/Sound";
import { buzz } from "@/constants/Haptic";
import { TIER_REWARDS, cosmeticsForSeason, resolveReward, seasonPassAtom } from "@/constants/SeasonPass";
import { getShopItem } from "@/constants/Shop";
import { shopItemText } from "@/constants/i18n/shopItems";
import { newPassTier, passTierKey, subscribeToCelebrations, type CelebrationEvent } from "@/constants/Celebration";

const CONFETTI = 26;
const CONFETTI_COLORS = ["#FF5A5A", "#FFD700", "#4ADE80", "#38BDF8", "#A78BFA", "#F472B6"];

/** Light rays behind the icon, turning slowly. */
function Rays({ color, size }: { color: string; size: number }) {
	const turn = useRef(new Animated.Value(0)).current;
	useEffect(() => {
		const loop = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 22000, easing: Easing.linear, useNativeDriver: true }));
		loop.start();
		return () => loop.stop();
	}, [turn]);
	const wedges = useMemo(() => {
		const count = 12;
		const r = size / 2;
		return Array.from({ length: count }, (_, i) => {
			const a0 = (i / count) * Math.PI * 2;
			const a1 = a0 + (Math.PI * 2) / count / 2;
			return `M ${r} ${r} L ${r + Math.cos(a0) * r} ${r + Math.sin(a0) * r} L ${r + Math.cos(a1) * r} ${r + Math.sin(a1) * r} Z`;
		});
	}, [size]);
	return (
		<Animated.View pointerEvents="none" style={{ position: "absolute", width: size, height: size, transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }}>
			<Svg width={size} height={size}>
				{wedges.map((d, i) => (
					<Path key={i} d={d} fill={withAlpha(color, 0.1)} />
				))}
			</Svg>
		</Animated.View>
	);
}

/** One falling pixel square: it drifts down with a little sway and turns. */
function Confetto({ index, height, width }: { index: number; height: number; width: number }) {
	const fall = useRef(new Animated.Value(0)).current;
	const spec = useMemo(() => {
		const seed = (index * 9301 + 49297) % 233280;
		const r = (k: number) => ((seed * (k + 3)) % 1000) / 1000;
		return { left: r(1) * (width - 12), size: 6 + Math.round(r(2) * 3) * 3, delay: Math.round(r(3) * 2200), duration: 3200 + Math.round(r(4) * 2600), color: CONFETTI_COLORS[index % CONFETTI_COLORS.length], spin: r(5) > 0.5 ? 1 : -1 };
	}, [index, width]);
	useEffect(() => {
		const loop = Animated.loop(Animated.timing(fall, { toValue: 1, duration: spec.duration, delay: spec.delay, easing: Easing.linear, useNativeDriver: true }));
		loop.start();
		return () => loop.stop();
	}, [fall, spec]);
	return (
		<Animated.View
			pointerEvents="none"
			style={{
				position: "absolute",
				top: 0,
				left: spec.left,
				width: spec.size,
				height: spec.size,
				backgroundColor: spec.color,
				transform: [
					{ translateY: fall.interpolate({ inputRange: [0, 1], outputRange: [-30, height + 30] }) },
					{ translateX: fall.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, 14, 0, -14, 0] }) },
					{ rotate: fall.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${spec.spin * 360}deg`] }) },
				],
			}}
		/>
	);
}

function Celebration({ event, onClose }: { event: CelebrationEvent; onClose: () => void }) {
	const { t } = useLanguage();
	const { playSfx } = useSoundSettings();
	const { width, height } = useWindowDimensions();
	const backdrop = useRef(new Animated.Value(0)).current;
	const pop = useRef(new Animated.Value(0)).current;
	const bob = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		void playSfx("achievement");
		buzz("success");
		Animated.timing(backdrop, { toValue: 1, duration: 260, useNativeDriver: true }).start();
		Animated.sequence([Animated.delay(180), Animated.spring(pop, { toValue: 1, friction: 4, tension: 70, useNativeDriver: true })]).start();
		const loop = Animated.loop(
			Animated.sequence([
				Animated.timing(bob, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
				Animated.timing(bob, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
			])
		);
		loop.start();
		return () => loop.stop();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const rays = Math.min(width, 520) * 1.3;
	return (
		<Animated.View style={[styles.host, { opacity: backdrop }]}>
			<View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(6, 4, 14, 0.97)" }]} />
			{Array.from({ length: CONFETTI }, (_, i) => (
				<Confetto key={i} index={i} height={height} width={width} />
			))}
			<View style={styles.center}>
				<View style={styles.iconStage}>
					<Rays color={event.accent} size={rays} />
					<Animated.View
						style={[
							styles.iconCircle,
							{
								borderColor: event.accent,
								backgroundColor: withAlpha(event.accent, 0.2),
								transform: [
									{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) },
									{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) },
								],
							},
						]}
					>
						<UiIcon name={event.icon} size={72} />
					</Animated.View>
				</View>
				<FadeInView delay={380} style={styles.texts}>
					<Text style={[styles.title, { color: event.accent }]}>{event.title}</Text>
					{event.subtitle ? <Text style={styles.subtitle}>{event.subtitle}</Text> : null}
					{event.coins ? (
						<View style={styles.coinRow}>
							<UiIcon name="coin" size={27} />
							<CountUp value={event.coins} style={styles.coins} suffix="" />
						</View>
					) : null}
					{(event.lines ?? []).map((line) => (
						<Text key={line} style={styles.line}>{line}</Text>
					))}
				</FadeInView>
			</View>
			<FadeInView delay={700} style={styles.footer}>
				<StylizedButton text={t("celebrate.ok")} onClick={onClose} backgroundColor="#16A34A" style={styles.button} textStyle={styles.buttonText} />
			</FadeInView>
		</Animated.View>
	);
}

/** Shows the celebrations one by one. A new pass level is noticed here (the pass state is shared by every screen). */
export default function CelebrationHost() {
	const { t, language } = useLanguage();
	const [appState] = useAppState();
	const inGame = !!appState.containsGameMode();
	const dailyOpen = useAtomValue(dailyRewardOpenAtom);
	const pass = useAtomValue(seasonPassAtom);
	const [queue, setQueue] = useState<CelebrationEvent[]>([]);
	const [current, setCurrent] = useState<CelebrationEvent | null>(null);

	useEffect(
		() =>
			subscribeToCelebrations((event) => {
				setQueue((previous) => (previous.some((entry) => entry.id === event.id) ? previous : [...previous, event]));
			}),
		[]
	);

	// a new pass level since the last time one was celebrated
	useEffect(() => {
		if (!pass) return;
		let cancelled = false;
		void (async () => {
			try {
				const key = passTierKey(pass.season);
				const stored = await AsyncStorage.getItem(key);
				const seen = stored === null ? null : Number(stored);
				const tier = newPassTier(seen !== null && Number.isFinite(seen) ? seen : null, pass.tier);
				if (stored === null || tier !== null) await AsyncStorage.setItem(key, String(pass.tier));
				if (cancelled || tier === null) return;
				const reward = resolveReward(TIER_REWARDS[tier - 1], cosmeticsForSeason(pass.season, pass.cosmetics));
				const item = reward.itemId ? getShopItem(reward.itemId) : undefined;
				const lines: string[] = [];
				if (item) lines.push(shopItemText(item, language).title);
				else if (reward.chest) lines.push(t(reward.chest === "big" ? "pass.reward.chestBig" : "pass.reward.chestSmall"));
				if (reward.keys > 0) lines.push(t("pass.reward.keys", { count: reward.keys }));
				setQueue((previous) => [
					...previous.filter((entry) => !entry.id.startsWith("tier:")),
					{ id: `tier:${pass.season}:${tier}`, icon: item || reward.chest ? "gift" : "starGold", accent: "#FBBF24", title: t("celebrate.tierTitle", { tier }), subtitle: t("celebrate.tierSub"), coins: reward.coins > 0 ? reward.coins : undefined, lines },
				]);
			} catch {
				// no celebration this time
			}
		})();
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pass?.season, pass?.tier]);

	useEffect(() => {
		if (current === null && queue.length > 0 && !inGame && !dailyOpen) {
			setCurrent(queue[0]);
			setQueue((previous) => previous.slice(1));
		}
	}, [current, queue, inGame, dailyOpen]);

	if (current === null) return null;
	return <Celebration key={current.id} event={current} onClose={() => setCurrent(null)} />;
}

const styles = StyleSheet.create({
	host: {
		...StyleSheet.absoluteFillObject,
		zIndex: 20000,
		alignItems: "center",
		justifyContent: "center",
	},
	center: {
		alignItems: "center",
		gap: 18,
		paddingHorizontal: 24,
	},
	iconStage: {
		width: 220,
		height: 220,
		alignItems: "center",
		justifyContent: "center",
	},
	iconCircle: {
		width: 140,
		height: 140,
		borderRadius: 70,
		borderWidth: 4,
		borderBottomWidth: 8,
		alignItems: "center",
		justifyContent: "center",
	},
	texts: {
		alignItems: "center",
		gap: 8,
	},
	title: {
		fontFamily: "SilkscreenBold",
		fontSize: 26,
		textAlign: "center",
	},
	subtitle: {
		fontFamily: "Silkscreen",
		fontSize: 13,
		color: "rgba(255,255,255,0.78)",
		textAlign: "center",
	},
	coinRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginTop: 4,
	},
	coins: {
		fontFamily: "SilkscreenBold",
		fontSize: 30,
		color: "#FFD700",
	},
	line: {
		fontFamily: "SilkscreenBold",
		fontSize: 14,
		color: "#FFFFFF",
		textAlign: "center",
	},
	footer: {
		position: "absolute",
		left: 24,
		right: 24,
		bottom: 48,
		alignItems: "center",
	},
	button: {
		alignSelf: "stretch",
		margin: 0,
		minHeight: 52,
	},
	buttonText: {
		fontSize: 18,
	},
});
