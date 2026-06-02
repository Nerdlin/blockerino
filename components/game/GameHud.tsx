import { useEffect, useState } from "react"
import { Pressable, StyleSheet, Text, View, Platform, useWindowDimensions } from "react-native"
import Animated, { SharedValue, interpolateColor, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from "react-native-reanimated"
import { Hand } from "@/constants/Hand";
import { GameModeType, MenuStateType, useAppState } from "@/hooks/useAppState";
import { getHighScores } from "@/constants/Storage";
import { colorToHex } from "@/constants/Color";
import { getPlayerGlobalHighScore } from "@/constants/Supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { normalizePlayerName } from "@/constants/Multiplayer";
import { useGameSizes } from "@/constants/Board";

const comboBarGoodColor = colorToHex({r: 0, g: 255, b: 0});
const comboBarBadColor = colorToHex({r: 255, g: 51, b: 51});

interface GameHudProps {
	score: SharedValue<number>,
	combo: SharedValue<number>,
	lastBrokenLine: SharedValue<number>,
	hand: SharedValue<Hand>,
	gameMode?: GameModeType,
	timeRemaining?: SharedValue<number>
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

export function StatsGameHud({ score, combo, lastBrokenLine, hand, gameMode, timeRemaining }: GameHudProps) {
	const [scoreText, setScoreText] = useState("0");
	const [timeLeftText, setTimeLeftText] = useState("60");
	const scoreAnimValue = useSharedValue(0); // stores the score, used to interpolate the number for animation
	const { width, height } = useWindowDimensions();
	const isMobile = width < 600 || height < 700;
	const isShortScreen = height < 700;
	
	const boardLength = gameMode === GameModeType.Chaos ? 10 : 8;
	const { GRID_BLOCK_SIZE } = useGameSizes(boardLength);
	const gridWidth = GRID_BLOCK_SIZE * boardLength + 6;

	useAnimatedReaction(() => {
		return score.value;
	}, (current, prev) => {
		scoreAnimValue.value = withTiming(current, { duration: 200 });
	})
	
	useAnimatedReaction(() => {
		return scoreAnimValue.value
	}, (current, _prev) => {
		runOnJS(setScoreText)(String(Math.floor(current)));
	})

	useAnimatedReaction(() => {
		return timeRemaining ? timeRemaining.value : 0;
	}, (current) => {
		if (timeRemaining) {
			runOnJS(setTimeLeftText)(String(Math.ceil(current)));
		}
	});

	return <>
		<View style={[styles.hudContainer, isMobile && { height: isShortScreen ? 70 : 90 }]}>
			<View style={[styles.scoreContainer, isMobile && { height: isShortScreen ? 28 : 38, marginTop: 2, marginBottom: 2 }]}>
				<Text style={{
					color: 'white',
					fontFamily: 'Silkscreen',
					fontSize: isMobile ? (isShortScreen ? 24 : 32) : 50,
					fontWeight: '100',
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
				}}>{scoreText}</Text>
			</View>
			
			{gameMode === GameModeType.TimeAttack && timeRemaining ? (
				<View style={{ width: gridWidth, alignItems: 'center', marginVertical: 4 }}>
					<Text style={{
						fontFamily: 'Silkscreen',
						color: '#FFD700',
						fontSize: isMobile ? 18 : 24,
						marginBottom: 4
					}}>
						⏳ {timeLeftText}s
					</Text>
					<TimerBar timeRemaining={timeRemaining} />
				</View>
			) : (
				<ComboBar lastBrokenLine={lastBrokenLine} handSize={hand.value.length} gridWidth={gridWidth}></ComboBar>
			)}
		</View>
	</>
}

interface ComboBarProps {
	lastBrokenLine: SharedValue<number>,
	handSize: number,
	gridWidth: number
};

function ComboBar({ lastBrokenLine, handSize, gridWidth }: ComboBarProps) {
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
		return {
			width: `${fillPercentage.value}%`,
			backgroundColor: interpolateColor(fillPercentage.value / 100, [0, 1/5, 1], ['transparent', comboBarBadColor, comboBarGoodColor]),
			transform: [
				{ scale: scale.value }
			]
		};
	});

	return (
		<View style={[styles.comboBarParent, { width: gridWidth }, isMobile && { height: 8, borderWidth: 1 }]}>
			<Animated.View style={[styles.comboBar, isMobile && { height: 6 }, animatedStyle]} />
		</View>
	);
};

export function StickyGameHud({gameMode, score}: {gameMode: GameModeType, score: SharedValue<number>}) {
	const [ highestScore, setHighestScore ] = useState(0);
	const [ globalPlayerBest, setGlobalPlayerBest ] = useState(0);
	const [ scoreState, setScoreState ] = useState(score.value);
	const { width, height } = useWindowDimensions();
	const isMobile = width < 600 || height < 700;

	useEffect(() => {
		let isMounted = true;

		const refreshBestScores = async () => {
			const highScores = await getHighScores(gameMode, true, true);
			if (isMounted && highScores.length > 0) {
				setHighestScore(highScores[0].score);
			}

			const playerName = normalizePlayerName((await AsyncStorage.getItem('PLAYER_NAME')) || '');
			if (playerName) {
				const serverBest = await getPlayerGlobalHighScore(playerName, gameMode);
				if (isMounted && serverBest !== null) {
					setGlobalPlayerBest(serverBest);
				}
			}
		};

		refreshBestScores();
		const timer = setInterval(refreshBestScores, 10000);

		return () => {
			isMounted = false;
			clearInterval(timer);
		};
	}, [gameMode]);
	
	useAnimatedReaction(() => {
		return score.value;
	}, (cur, prev) => {
		runOnJS(setScoreState)(score.value);
	});

	return <>
		<Text style={[
			styles.highScoreLabel,
			isMobile && {
				fontSize: 22,
				top: 15,
				left: 15
			}
		]}>{"👑" + Math.max(scoreState, highestScore, globalPlayerBest)}</Text>
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
		<Text style={[
			styles.settingsEmoji,
			isMobile && {
				fontSize: 22
			}
		]}>
			{"⚙️"}
		</Text>
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
	settingsEmoji: {
		color: 'white',
		fontSize: 30
	},
	highScoreLabel: {
		color: 'rgb(240, 175, 12)',
		fontFamily: 'Silkscreen',
		fontSize: 35,
		fontWeight: '100',
		position: 'absolute',
		top: 50,
		left: 50
	},
	hudContainer: {
		width: '100%',
		height: 120,
		justifyContent: 'center',
		alignItems: 'center',
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
		height: 12,
		borderRadius: 10,
		backgroundColor: 'blue',
		zIndex: 99,
		position: 'absolute'
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
		fontWeight: '900',
		fontSize: 30,
		marginLeft: 2,
		alignSelf: 'flex-start',
		position: 'absolute',
	}
})
