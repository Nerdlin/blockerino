import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Animated, {
	Easing,
	runOnJS,
	useAnimatedReaction,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import CosmeticPreview from "./CosmeticPreview";
import UiIcon from "./UiIcon";
import { getShopItem } from "@/constants/Shop";
import { useSoundSettings } from "@/constants/Sound";
import { RARITY_COLORS, type ChestPrize } from "@/constants/DailyReward";
import { ROULETTE_WIN_INDEX, buildRouletteStrip, type RouletteTile } from "@/constants/Chests";

const TILE = 86;
const GAP = 8;
const STEP = TILE + GAP;
const SPIN_MS = 5600;

/**
 * The chest opening: a strip of prizes in rarity colours rushes past a gold marker and slows down on the prize the
 * server rolled. Each tile that passes the marker clicks. onDone fires when the strip stops.
 */
export default function ChestRoulette({ prize, onDone }: { prize: ChestPrize; onDone: () => void }) {
	const { playSfx } = useSoundSettings();
	const prizeItem = prize.kind === "item" ? getShopItem(prize.itemId) : undefined;
	const strip = useMemo(() => buildRouletteStrip(prize, prizeItem), [prize, prizeItem]);
	const [width, setWidth] = useState(0);
	const [stopped, setStopped] = useState(false);
	const offset = useSharedValue(0);
	const lastTick = useRef(0);
	const doneRef = useRef(onDone);
	doneRef.current = onDone;

	const tick = useCallback(() => {
		const now = Date.now();
		if (now - lastTick.current < 40) return;
		lastTick.current = now;
		void playSfx("buttonHover");
	}, [playSfx]);

	const finish = useCallback(() => {
		setStopped(true);
		void playSfx("menuClick");
		doneRef.current();
	}, [playSfx]);

	useEffect(() => {
		if (width === 0) return;
		// the prize's centre under the marker, a little off centre so it does not look rigged
		const jitter = (Math.random() - 0.5) * TILE * 0.6;
		const target = ROULETTE_WIN_INDEX * STEP + TILE / 2 - width / 2 + jitter;
		offset.value = 0;
		offset.value = withDelay(250, withTiming(target, { duration: SPIN_MS, easing: Easing.bezier(0.1, 0.72, 0.12, 1) }, (finished) => {
			if (finished) runOnJS(finish)();
		}));
	}, [width, offset, finish]);

	useAnimatedReaction(
		() => Math.floor((offset.value + width / 2) / STEP),
		(current, previous) => {
			if (previous !== null && current !== previous && width > 0) runOnJS(tick)();
		},
		[width]
	);

	const stripStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -offset.value }] }));

	const onLayout = (event: LayoutChangeEvent) => {
		const next = Math.round(event.nativeEvent.layout.width);
		if (next > 0 && width === 0) setWidth(next);
	};

	return (
		<View style={styles.window} onLayout={onLayout}>
			<Animated.View style={[styles.strip, stripStyle]}>
				{strip.map((tile, index) => (
					<Tile key={index} tile={tile} won={stopped && index === ROULETTE_WIN_INDEX} dimmed={stopped && index !== ROULETTE_WIN_INDEX} />
				))}
			</Animated.View>
			{/* the edges fade into the window */}
			<LinearGradient pointerEvents="none" colors={["rgba(0,0,0,0.9)", "rgba(0,0,0,0)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fade, { left: 0 }]} />
			<LinearGradient pointerEvents="none" colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.9)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fade, { right: 0 }]} />
			{/* the marker */}
			<View pointerEvents="none" style={styles.marker}>
				<View style={styles.markerTop} />
				<View style={styles.markerLine} />
				<View style={styles.markerBottom} />
			</View>
		</View>
	);
}

function Tile({ tile, won, dimmed }: { tile: RouletteTile; won: boolean; dimmed: boolean }) {
	const color = RARITY_COLORS[tile.rarity];
	const pulse = useSharedValue(1);
	useEffect(() => {
		if (won) pulse.value = withSequence(withTiming(1.14, { duration: 160 }), withRepeat(withSequence(withTiming(1.06, { duration: 520 }), withTiming(1.0, { duration: 520 })), -1, true));
	}, [won, pulse]);
	const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
	return (
		<Animated.View style={[styles.tile, { borderColor: color, backgroundColor: `${color}1F`, opacity: dimmed ? 0.35 : 1 }, won && { shadowColor: color, shadowOpacity: 0.9, shadowRadius: 14, elevation: 10 }, style]}>
			<View style={[styles.tileBand, { backgroundColor: color }]} />
			{tile.kind === "item" ? (
				<View style={styles.preview}>
					<CosmeticPreview item={tile.item} />
				</View>
			) : (
				<View style={styles.coins}>
					<UiIcon name="coin" size={30} />
					<Text style={styles.coinsText}>{tile.coins}</Text>
				</View>
			)}
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	window: {
		alignSelf: "stretch",
		height: TILE + 34,
		justifyContent: "center",
		overflow: "hidden",
		borderRadius: 14,
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.1)",
		backgroundColor: "rgba(0,0,0,0.35)",
	},
	strip: {
		flexDirection: "row",
		gap: GAP,
	},
	tile: {
		width: TILE,
		height: TILE,
		borderRadius: 10,
		borderWidth: 2,
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
	},
	tileBand: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: 6,
	},
	preview: {
		width: TILE - 14,
		alignItems: "center",
	},
	coins: {
		alignItems: "center",
		gap: 4,
	},
	coinsText: {
		fontFamily: "Silkscreen",
		fontSize: 13,
		color: "#FFD700",
	},
	fade: {
		position: "absolute",
		top: 0,
		bottom: 0,
		width: 56,
	},
	marker: {
		position: "absolute",
		top: 0,
		bottom: 0,
		left: "50%",
		width: 14,
		marginLeft: -7,
		alignItems: "center",
	},
	markerLine: {
		flex: 1,
		width: 3,
		backgroundColor: "#FFD700",
		shadowColor: "#FFD700",
		shadowOpacity: 0.9,
		shadowRadius: 6,
	},
	markerTop: {
		width: 0,
		height: 0,
		borderLeftWidth: 7,
		borderRightWidth: 7,
		borderTopWidth: 9,
		borderLeftColor: "transparent",
		borderRightColor: "transparent",
		borderTopColor: "#FFD700",
	},
	markerBottom: {
		width: 0,
		height: 0,
		borderLeftWidth: 7,
		borderRightWidth: 7,
		borderBottomWidth: 9,
		borderLeftColor: "transparent",
		borderRightColor: "transparent",
		borderBottomColor: "#FFD700",
	},
});
