import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAtomValue } from "jotai";
import Animated, { Easing, interpolate, interpolateColor, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";
import StylizedButton from "../StylizedButton";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { createEmptyBlockStyle, createFilledBlockStyle, pieceColors } from "@/constants/Piece";
import { shopStateAtom } from "@/constants/Shop";

// Shown in the very first game only, in two steps. 1: a small board plays itself: two pieces are dragged up from the
// hand, the second one fills the bottom row and the row clears. 2: how a game is lost: the board is almost full,
// a square is carried over it, fits nowhere and the board flashes red.

const CELL = 32;
const COLS = 5;
const ROWS = 3;
const LOOP_MS = 5200;
const HAND_DROP = 70; // how far below the board a piece starts, in the hand

// timeline of one loop, as fractions of LOOP_MS
const T = {
	firstStart: 0.06, firstEnd: 0.28,
	secondStart: 0.36, secondEnd: 0.58,
	flash: 0.62, cleared: 0.72,
	fadeOut: 0.92,
};

type Cell = { x: number; y: number };

function DemoPiece({ progress, cells, color, from, to, skin }: { progress: SharedValue<number>; cells: Cell[]; color: number; from: number; to: number; skin: string }) {
	const style = useAnimatedStyle(() => {
		const t = progress.value;
		const move = interpolate(t, [from, to], [1, 0], "clamp");
		// the second piece is part of the bottom row once it lands, so it clears with the row
		const clearedAway = cells[0].y === ROWS - 1 ? interpolate(t, [T.flash, T.cleared], [1, 0], "clamp") : 1;
		const loopFade = interpolate(t, [T.fadeOut, 1], [1, 0], "clamp");
		const appear = interpolate(t, [0, T.firstStart * 0.6], [0, 1], "clamp");
		return {
			opacity: Math.min(clearedAway, loopFade, appear),
			transform: [{ translateY: move * HAND_DROP }, { scale: 1 - move * 0.3 }],
		};
	});
	return (
		<Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
			{cells.map((cell) => (
				<View key={`${cell.x},${cell.y}`} style={[styles.cell, { left: cell.x * CELL, top: cell.y * CELL }, createFilledBlockStyle(pieceColors[color], 4, skin)]} />
			))}
		</Animated.View>
	);
}

function TouchDot({ progress }: { progress: SharedValue<number> }) {
	// the finger that drags each piece: it presses below the board, carries the piece up and lets go
	const style = useAnimatedStyle(() => {
		const t = progress.value;
		const first = t >= T.firstStart - 0.03 && t <= T.firstEnd + 0.03;
		const second = t >= T.secondStart - 0.03 && t <= T.secondEnd + 0.03;
		if (!first && !second) return { opacity: 0 };
		const [start, end, x, y] = first ? [T.firstStart, T.firstEnd, 1, 0] : [T.secondStart, T.secondEnd, 3.5, 2];
		const move = interpolate(t, [start, end], [1, 0], "clamp");
		return {
			opacity: 0.85,
			transform: [{ translateX: x * CELL + CELL / 2 - 9 }, { translateY: y * CELL + CELL * 0.9 + move * HAND_DROP }],
		};
	});
	return <Animated.View style={[styles.dot, style]} pointerEvents="none" />;
}

function BoardDemo() {
	const skin = useAtomValue(shopStateAtom).equipped.piece_skin;
	const progress = useSharedValue(0);
	useEffect(() => {
		progress.value = withRepeat(withTiming(1, { duration: LOOP_MS, easing: Easing.linear }), -1, false);
	}, [progress]);

	// the bottom row, filled but for the last two cells
	const rowStyle = useAnimatedStyle(() => ({
		opacity: Math.min(
			interpolate(progress.value, [T.flash, T.cleared], [1, 0], "clamp"),
			interpolate(progress.value, [0, T.firstStart * 0.6], [0, 1], "clamp"),
		),
	}));
	const flashStyle = useAnimatedStyle(() => ({
		opacity: interpolate(progress.value, [T.secondEnd, T.flash, T.cleared], [0, 0.85, 0], "clamp"),
	}));

	return (
		<View style={{ width: COLS * CELL, height: ROWS * CELL + HAND_DROP * 0.55, alignItems: "flex-start" }}>
			<View style={{ width: COLS * CELL, height: ROWS * CELL }}>
				{Array.from({ length: ROWS * COLS }, (_, i) => (
					<View key={i} style={[styles.cell, { left: (i % COLS) * CELL, top: Math.floor(i / COLS) * CELL }, createEmptyBlockStyle("rgba(255,255,255,0.18)")]} />
				))}
				<Animated.View style={[StyleSheet.absoluteFill, rowStyle]} pointerEvents="none">
					{[0, 1, 2].map((x) => (
						<View key={x} style={[styles.cell, { left: x * CELL, top: (ROWS - 1) * CELL }, createFilledBlockStyle(pieceColors[(x + 2) % pieceColors.length], 4, skin)]} />
					))}
				</Animated.View>
				<DemoPiece progress={progress} cells={[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]} color={0} from={T.firstStart} to={T.firstEnd} skin={skin} />
				<DemoPiece progress={progress} cells={[{ x: 3, y: 2 }, { x: 4, y: 2 }]} color={5} from={T.secondStart} to={T.secondEnd} skin={skin} />
				<Animated.View style={[styles.flash, { top: (ROWS - 1) * CELL, width: COLS * CELL }, flashStyle]} pointerEvents="none" />
				<TouchDot progress={progress} />
			</View>
		</View>
	);
}

// step 2: the board has only single free cells; a 2x2 square is carried across it and fits nowhere
const LOSE_LOOP_MS = 4200;
const LOSE_HOLES = [{ x: 1, y: 0 }, { x: 3, y: 1 }, { x: 0, y: 2 }, { x: 4, y: 0 }];
const L = { rise: 0.05, risen: 0.22, sweepEnd: 0.6, back: 0.72, flashStart: 0.6, flashEnd: 0.92 };

function LoseDemo() {
	const skin = useAtomValue(shopStateAtom).equipped.piece_skin;
	const progress = useSharedValue(0);
	useEffect(() => {
		progress.value = withRepeat(withTiming(1, { duration: LOSE_LOOP_MS, easing: Easing.linear }), -1, false);
	}, [progress]);

	const filled: Cell[] = [];
	for (let y = 0; y < ROWS; y++) {
		for (let x = 0; x < COLS; x++) {
			if (!LOSE_HOLES.some((hole) => hole.x === x && hole.y === y)) filled.push({ x, y });
		}
	}

	// the square goes up from the hand, slides over the board looking for room, turns red and drops back
	const pieceStyle = useAnimatedStyle(() => {
		const t = progress.value;
		const up = interpolate(t, [L.rise, L.risen, L.sweepEnd, L.back], [1, 0, 0, 1], "clamp");
		const x = interpolate(t, [L.risen, (L.risen + L.sweepEnd) / 2, L.sweepEnd], [0, 3, 1.5], "clamp");
		return {
			opacity: interpolate(t, [0, L.rise, L.back, L.back + 0.08], [0, 1, 1, 0], "clamp"),
			transform: [{ translateX: x * CELL }, { translateY: up * HAND_DROP }, { scale: 1 - up * 0.3 }],
		};
	});
	const tintStyle = useAnimatedStyle(() => ({
		backgroundColor: interpolateColor(progress.value, [L.risen, L.sweepEnd - 0.1, L.sweepEnd], ["rgba(255,59,59,0)", "rgba(255,59,59,0.25)", "rgba(255,59,59,0.75)"]),
	}));
	const frameStyle = useAnimatedStyle(() => {
		const t = progress.value;
		const on = t >= L.flashStart && t <= L.flashEnd;
		const pulse = on ? 0.5 + 0.5 * Math.sin(((t - L.flashStart) / (L.flashEnd - L.flashStart)) * Math.PI * 4) : 0;
		return { opacity: pulse };
	});

	return (
		<View style={{ width: COLS * CELL, height: ROWS * CELL + HAND_DROP * 0.55, alignItems: "flex-start" }}>
			<View style={{ width: COLS * CELL, height: ROWS * CELL }}>
				{Array.from({ length: ROWS * COLS }, (_, i) => (
					<View key={i} style={[styles.cell, { left: (i % COLS) * CELL, top: Math.floor(i / COLS) * CELL }, createEmptyBlockStyle("rgba(255,255,255,0.18)")]} />
				))}
				{filled.map((cell, i) => (
					<View key={"f" + i} style={[styles.cell, { left: cell.x * CELL, top: cell.y * CELL }, createFilledBlockStyle(pieceColors[(i * 5 + 1) % pieceColors.length], 4, skin)]} />
				))}
				<Animated.View style={[styles.square, pieceStyle]} pointerEvents="none">
					{[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }].map((cell) => (
						<View key={cell.x + "," + cell.y} style={[styles.cell, { left: cell.x * CELL, top: cell.y * CELL }, createFilledBlockStyle(pieceColors[2], 4, skin)]} />
					))}
					<Animated.View style={[StyleSheet.absoluteFill, tintStyle]} />
				</Animated.View>
				<Animated.View style={[styles.loseFrame, frameStyle]} pointerEvents="none" />
			</View>
		</View>
	);
}

export default function FirstRunCoach({ onDismiss }: { onDismiss: () => void }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const [step, setStep] = useState<1 | 2>(1);

	return (
		<View style={styles.wrapper}>
			<View style={[styles.card, { backgroundColor: currentTheme.menuBackground, borderColor: step === 2 ? "#FF3B3B" : currentTheme.accent }]}>
				<Text style={[styles.title, { color: step === 2 ? "#FF5A5A" : currentTheme.accent }]}>{t(step === 1 ? "firstrun.title" : "firstrun.loseTitle")}</Text>
				{step === 1 ? (
					<>
						<BoardDemo />
						<Text style={[styles.line, { color: currentTheme.textPrimary }]}>{t("firstrun.drag")}</Text>
						<Text style={[styles.line, { color: currentTheme.textPrimary }]}>{t("firstrun.clear")}</Text>
						<Text style={[styles.line, { color: currentTheme.textSecondary }]}>{t("firstrun.combo")}</Text>
					</>
				) : (
					<>
						<LoseDemo />
						<Text style={[styles.line, { color: currentTheme.textPrimary }]}>{t("firstrun.lose")}</Text>
						<Text style={[styles.line, { color: currentTheme.textSecondary }]}>{t("firstrun.goal")}</Text>
					</>
				)}
				<Text style={[styles.steps, { color: currentTheme.textSecondary }]}>{step} / 2</Text>
				<StylizedButton
					text={t(step === 1 ? "firstrun.next" : "firstrun.gotIt")}
					onClick={step === 1 ? () => setStep(2) : onDismiss}
					backgroundColor={currentTheme.buttonPrimary}
					style={{ minWidth: 160, height: 44, marginTop: 6 }}
					textStyle={{ fontSize: 14 }}
				/>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	wrapper: {
		...StyleSheet.absoluteFillObject,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(0,0,0,0.55)",
		zIndex: 50,
	},
	card: {
		width: "88%",
		maxWidth: 420,
		borderWidth: 2,
		borderRadius: 14,
		paddingVertical: 16,
		paddingHorizontal: 16,
		alignItems: "center",
		gap: 8,
	},
	title: {
		fontFamily: "Silkscreen",
		fontSize: 18,
		textAlign: "center",
	},
	line: {
		fontFamily: "Silkscreen",
		fontSize: 12,
		textAlign: "center",
		lineHeight: 18,
	},
	steps: {
		fontFamily: "Silkscreen",
		fontSize: 10,
	},
	square: {
		position: "absolute",
		left: 0,
		top: 0,
		width: CELL * 2,
		height: CELL * 2,
	},
	loseFrame: {
		...StyleSheet.absoluteFillObject,
		borderWidth: 3,
		borderColor: "#FF3B3B",
	},
	cell: {
		position: "absolute",
		width: CELL,
		height: CELL,
	},
	flash: {
		position: "absolute",
		left: 0,
		height: CELL,
		backgroundColor: "#FFFFFF",
	},
	dot: {
		position: "absolute",
		left: 0,
		top: 0,
		width: 18,
		height: 18,
		borderRadius: 9,
		backgroundColor: "rgba(255,255,255,0.9)",
		borderWidth: 2,
		borderColor: "rgba(0,0,0,0.35)",
	},
});
