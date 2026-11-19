import { memo, useEffect, useRef, useState } from "react"
import { Pressable, StyleSheet, Text, View, Platform, useWindowDimensions } from "react-native"
import Animated, { Easing, SharedValue, cancelAnimation, interpolateColor, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from "react-native-reanimated"
import { GameModeType, MenuStateType, useAppState } from "@/hooks/useAppState";
import { getHighScores } from "@/constants/Storage";
import { colorToHex } from "@/constants/Color";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useGameSizes } from "@/constants/Board";
import PixelIcon from "@/components/PixelIcon";
import { getGameModeConfig } from "@/constants/GameModes";
import { useLanguage } from "@/constants/Localization";
import { buzz } from "@/constants/Haptic";
import { useEffectsProfile } from "@/constants/EffectsProfile";

/** The best saved score of a mode (0 until one is saved), loaded once. */
function useBestScore(gameMode?: GameModeType): number {
	const [best, setBest] = useState(0);
	useEffect(() => {
		if (gameMode === undefined) return;
		let mounted = true;
		getHighScores(gameMode, true, true).then((scores) => {
			if (mounted && scores.length > 0) setBest(scores[0].score);
		}).catch(() => undefined);
		return () => {
			mounted = false;
		};
	}, [gameMode]);
	return best;
}

const RECORD_COLORS = ["#FF6BD6", "#FFD36B", "#6BFFB0", "#6BC7FF", "#FF6BD6"];

const comboBarGoodColor = colorToHex({r: 0, g: 255, b: 0});
const comboBarBadColor = colorToHex({r: 255, g: 51, b: 51});

interface GameHudProps {
	score: SharedValue<number>,
	combo: SharedValue<number>,
	lastBrokenLine: SharedValue<number>,
	handSize: number,
	gameMode?: GameModeType,
	timeRemaining?: SharedValue<number>,
	movesRemaining?: SharedValue<number>
}

function TimerBar({ timeRemaining }: { timeRemaining: SharedValue<number> }) {
	const animatedStyle = useAnimatedStyle(() => {
		const time = timeRemaining.value;
		const percentage = Math.min(100, Math.max(0, (time / 60) * 100));
		const barColor = interpolateColor(
			time / 60,
			[0, 0.25, 0.5, 1],
			[
				'rgb(255, 51, 51)',   // red
				'rgb(255, 153, 51)',  // orange
				'rgb(0, 255, 100)',   // green
				'rgb(0, 255, 100)'    // green
			]
		);
		return {
			width: `${percentage}%`,
			backgroundColor: barColor,
		};
	});

	return (
		<View style={styles.timerBarParent}>
			<Animated.View style={[styles.timerBar, animatedStyle]} />
		</View>
	);
}

function MoveLimitBar({ movesRemaining, moveLimit }: { movesRemaining: SharedValue<number>, moveLimit: number }) {
	const animatedStyle = useAnimatedStyle(() => {
		const percentage = Math.min(100, Math.max(0, (movesRemaining.value / moveLimit) * 100));
		const barColor = interpolateColor(
			percentage / 100,
			[0, 0.25, 0.6, 1],
			[
				'rgb(255, 51, 51)',
				'rgb(255, 153, 51)',
				'rgb(255, 215, 0)',
				'rgb(0, 255, 204)'
			]
		);
		return {
			width: `${percentage}%`,
			backgroundColor: barColor,
		};
	});

	return (
		<View style={styles.timerBarParent}>
			<Animated.View style={[styles.timerBar, animatedStyle]} />
		</View>
	);
}

export const StatsGameHud = memo(function StatsGameHud({ score, lastBrokenLine, handSize, gameMode, timeRemaining, movesRemaining }: GameHudProps) {
	const { t } = useLanguage();
	const [scoreText, setScoreText] = useState("0");
	const [timeLeftText, setTimeLeftText] = useState("60");
	const [movesLeftText, setMovesLeftText] = useState("30");
	const scoreAnimValue = useSharedValue(0); // stores the score, used to interpolate the number for animation
	const [scoreNow, setScoreNow] = useState(0);
	const best = useBestScore(gameMode);
	const lightEffects = useEffectsProfile() === "light";
	// only a score that was at or below the saved best during this session can beat it (a resumed game already past it stays quiet)
	const wasBelow = useRef(false);
	if (best > 0 && scoreNow <= best) wasBelow.current = true;
	const beaten = best > 0 && scoreNow > best && wasBelow.current;
	const recordOn = useSharedValue(0);
	const hue = useSharedValue(0);
	const pop = useSharedValue(1);
	const labelOpacity = useSharedValue(0);
	useEffect(() => {
		if (!beaten) {
			cancelAnimation(hue);
			recordOn.value = 0;
			hue.value = 0;
			pop.value = 1;
			labelOpacity.value = 0;
			return;
		}
		// the first point past the saved best: a pop, a buzz, a label that fades, and a score that keeps shimmering
		recordOn.value = 1;
		buzz("success");
		pop.value = withSequence(withTiming(1.3, { duration: 140 }), withTiming(1, { duration: 260 }));
		labelOpacity.value = withSequence(withTiming(1, { duration: 150 }), withDelay(2200, withTiming(0, { duration: 400 })));
		if (!lightEffects) hue.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.linear }), -1, false);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [beaten, lightEffects]);
	const scoreStyle = useAnimatedStyle(() => ({
		transform: [{ scale: pop.value }],
		color: recordOn.value === 0 ? "white" : lightEffects ? "#FFD700" : interpolateColor(hue.value, [0, 0.25, 0.5, 0.75, 1], RECORD_COLORS),
	}));
	const labelStyle = useAnimatedStyle(() => ({ opacity: labelOpacity.value }));
	const { width, height } = useWindowDimensions();
	const isMobile = width < 600 || height < 700;
	const isShortScreen = height < 700;
	
	const modeConfig = gameMode ? getGameModeConfig(gameMode) : undefined;
	const boardLength = modeConfig?.boardLength ?? 8;
	const moveLimit = modeConfig?.moveLimit;
	const { GRID_BLOCK_SIZE } = useGameSizes(boardLength);
	const gridWidth = GRID_BLOCK_SIZE * boardLength + 6;

	useAnimatedReaction(() => {
		return score.value;
	}, (current, prev) => {
		scoreAnimValue.value = withTiming(current, { duration: 200 });
	})
	
	useAnimatedReaction(() => Math.floor(scoreAnimValue.value), (current, previous) => {
		if (current !== previous) {
			runOnJS(setScoreText)(String(current));
			runOnJS(setScoreNow)(current);
		}
	});

	useAnimatedReaction(() => {
		return timeRemaining ? timeRemaining.value : 0;
	}, (current) => {
		if (timeRemaining) {
			runOnJS(setTimeLeftText)(String(Math.ceil(current)));
		}
	});

	useAnimatedReaction(() => {
		return movesRemaining ? movesRemaining.value : 0;
	}, (current) => {
		if (movesRemaining) {
			runOnJS(setMovesLeftText)(String(Math.ceil(current)));
		}
	});

	return <>
		<View style={[styles.hudContainer, isMobile && { height: isShortScreen ? 70 : 90 }]}>
			<View style={[styles.scoreContainer, isMobile && { height: isShortScreen ? 28 : 38, marginTop: 2, marginBottom: 2 }]}>
				<Animated.Text style={[{
					fontFamily: 'Silkscreen',
					fontSize: isMobile ? (isShortScreen ? 24 : 32) : 50,
					...Platform.select({
						web: {
							textShadow: "3px 3px 10px rgb(0, 0, 0)"
						},
						default: {
							textShadowColor: 'rgb(0, 0, 0)',
							textShadowOffset: { width: 3, height: 3 },
							textShadowRadius: 10,
						}
					}),
					alignSelf: 'center'
				}, scoreStyle]}>{scoreText}</Animated.Text>
				<Animated.Text pointerEvents="none" style={[styles.recordLabel, labelStyle]}>{t("hud.newRecord")}</Animated.Text>
			</View>
			
			{moveLimit !== undefined && movesRemaining ? (
				<View style={{ width: gridWidth, alignItems: 'center', marginVertical: 4 }}>
					<Text style={{
						fontFamily: 'Silkscreen',
						color: '#FF5A66',
						fontSize: isMobile ? 18 : 24,
						marginBottom: 4
					}}>
						{t("hud.moves", { count: movesLeftText })}
					</Text>
					<MoveLimitBar movesRemaining={movesRemaining} moveLimit={moveLimit} />
				</View>
			) : modeConfig?.timeLimitSeconds !== undefined && timeRemaining ? (
				<View style={{ width: gridWidth, alignItems: 'center', marginVertical: 4 }}>
					<Text style={{
						fontFamily: 'Silkscreen',
						color: '#FFD700',
						fontSize: isMobile ? 18 : 24,
						marginBottom: 4
					}}>
						{t("hud.time", { seconds: timeLeftText })}
					</Text>
					<TimerBar timeRemaining={timeRemaining} />
				</View>
			) : (
				<ComboBar lastBrokenLine={lastBrokenLine} handSize={handSize} gridWidth={gridWidth} />
			)}
		</View>
	</>
});

interface ComboBarProps {
	lastBrokenLine: SharedValue<number>,
	handSize: number,
	gridWidth: number
};

const ComboBar = memo(function ComboBar({ lastBrokenLine, handSize, gridWidth }: ComboBarProps) {
	const { t } = useLanguage();
	const fillPercentage = useSharedValue(100);
	const scale = useSharedValue(1);
	const { width, height } = useWindowDimensions();
	const isMobile = width < 600 || height < 700;
	
	useAnimatedReaction(() => {
		return lastBrokenLine.value;
	}, (cur, prev) => {
		'worklet';
		fillPercentage.value = withSpring((1 - cur / handSize) * 100, {
			duration: 800,
			overshootClamping: true
		});

		// Trigger pulse scale animation on last line warning
		if (cur === handSize - 1) {
			scale.value = withRepeat(
				withDelay(500, withRepeat(withSequence(withTiming(1.1, { duration: 150 }), withTiming(1, { duration: 150 })), 2)),
				-1,
				true
			);
		} else {
			scale.value = withTiming(1, { duration: 200 });
		}
	});

	const animatedStyle = useAnimatedStyle(() => {
		const fill = Math.max(0, Math.min(1, fillPercentage.value / 100));
		return {
			backgroundColor: interpolateColor(fill, [0, 1/5, 1], ['transparent', comboBarBadColor, comboBarGoodColor]),
			transform: [
				{ scaleX: fill },
				{ scaleY: scale.value },
			]
		};
	});

	return (
		<View style={{ width: gridWidth, alignItems: 'center' }}>
			<View style={[styles.comboBarParent, { width: gridWidth }, isMobile && { height: 8, borderWidth: 1 }]}>
				<Animated.View style={[styles.comboBar, isMobile && { height: 6 }, animatedStyle]} />
			</View>
			<Text style={styles.comboCaption}>{t("hud.comboBar")}</Text>
		</View>
	);
});

export function StickyGameHud({gameMode, score}: {gameMode: GameModeType, score: SharedValue<number>}) {
	const highestScore = useBestScore(gameMode);
	const [ scoreState, setScoreState ] = useState(score.value);
	const { width, height } = useWindowDimensions();
	const isMobile = width < 600 || height < 700;

	useAnimatedReaction(() => {
		return score.value;
	}, (cur, prev) => {
		runOnJS(setScoreState)(score.value);
	});

	return <>
		{gameMode !== GameModeType.Level && <View style={[
			styles.highScoreLabel,
			isMobile && {
				top: 15,
				left: 15
			}
		]}>
			<PixelIcon name="crown" size={isMobile ? 24 : 34} color="#F0AF0C" secondaryColor="#FFE68A" />
			<Text style={[styles.highScoreText, isMobile && { fontSize: 22 }]}>
				{Math.max(scoreState, highestScore)}
			</Text>
		</View>}
		<SettingsButton isMobile={isMobile}></SettingsButton>
	</>
}

function SettingsButton({ isMobile }: { isMobile?: boolean }) {
	const [, , appendAppState ] = useAppState();
	const openSettings = () => { appendAppState(MenuStateType.OPTIONS); };

	useEscapeKey(openSettings);

	return <Pressable 
		onPress={openSettings} 
		style={[
			styles.settingsButton,
			isMobile && {
				width: 40,
				height: 40,
				borderRadius: 12,
				top: 15,
				right: 15
			}
		]}
	>
		<PixelIcon name="gear" size={isMobile ? 24 : 30} color="#D7D7D7" secondaryColor="#FFFFFF" />
	</Pressable>
}

const styles = StyleSheet.create({
	settingsButton: {
		width: 50,
		height: 50,
		borderRadius: 18,
		backgroundColor: 'rgba(20, 20, 20, 0.8)',
		justifyContent: 'center',
		alignItems: 'center',
		position: 'absolute',
		alignSelf: 'flex-end',
		zIndex: 1000,
		top: 50,
		right: 50
	},
	highScoreLabel: {
		position: 'absolute',
		top: 50,
		left: 50,
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		zIndex: 1000,
	},
	highScoreText: {
		color: 'rgb(240, 175, 12)',
		fontFamily: 'Silkscreen',
		fontSize: 35,
	},
	hudContainer: {
		width: '100%',
		height: 120,
		justifyContent: 'center',
		alignItems: 'center',
	},
	recordLabel: {
		position: 'absolute',
		top: -12,
		alignSelf: 'center',
		fontFamily: 'Silkscreen',
		fontSize: 11,
		color: '#FFD700',
		letterSpacing: 2,
	},
	scoreContainer: {
		width: '100%',
		height: 54,
		justifyContent: 'center',
		alignItems: 'center',
		marginTop: 14,
		marginBottom: 14,
	},
	comboBarParent: {
		width: '100%',
		height: 16,
		borderWidth: 2,
		borderRadius: 10,
		borderColor: 'gray',
		zIndex: 100,
	},
	comboBar: {
		width: '100%',
		height: 12,
		borderRadius: 10,
		backgroundColor: 'blue',
		zIndex: 99,
		position: 'absolute',
		left: 0,
		transformOrigin: '0% 50%',
	},
	comboCaption: {
		marginTop: 2,
		fontFamily: 'Silkscreen',
		fontSize: 8,
		color: 'rgba(255, 255, 255, 0.6)',
	},
	timerBarParent: {
		width: '100%',
		height: 14,
		borderWidth: 2,
		borderRadius: 8,
		borderColor: 'gray',
		zIndex: 100,
		backgroundColor: 'rgba(0, 0, 0, 0.4)',
		overflow: 'hidden',
	},
	timerBar: {
		height: 10,
		borderRadius: 8,
		zIndex: 99,
	},
	hudLabel: {
		color: 'white',
		fontFamily: 'Silkscreen',
		fontSize: 30,
		marginLeft: 2,
		alignSelf: 'flex-start',
		position: 'absolute',
	}
})
