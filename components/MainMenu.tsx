import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle, useWindowDimensions } from "react-native";
import Animated, { BounceInUp, Easing, FadeIn, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { MenuStateType, useSetAppState } from "@/hooks/useAppState";
import { cssColors } from "@/constants/Color";
import { GameModeType } from '@/hooks/useAppState';
import { PieceData } from "@/constants/Piece";
import { PieceView } from "./PieceView";
import { shopStateAtom } from "@/constants/Shop";
import { useAtomValue } from "jotai";
import { shouldCheckConnectionBeforeStart } from "@/constants/GameStart";
import PixelIcon from "./PixelIcon";

const logoBPiece: PieceData = {
	matrix: [
		[1, 1, 1, 0],
		[1, 0, 0, 1],
		[1, 1, 1, 0],
		[1, 0, 0, 1],
		[1, 1, 1, 0]
	],
	distributionPoints: 0,
	color: { r: 255, g: 51, b: 90 }
};
const logoNPiece: PieceData = {
	matrix: [
		[1, 1, 1, 1],
		[1, 0, 0, 1],
		[1, 0, 0, 1],
		[1, 0, 0, 1]
	],
	distributionPoints: 0,
	color: { r: 255, g: 0, b: 255 }
};

function BlockerinoLogo({blockSize, style}: {blockSize: number, style: ViewStyle}) {
	const nTop = blockSize * 80/30
	const nLeft = blockSize * 50/30
	return <View style={[{width: blockSize * 4 + nLeft, height: blockSize * 4 + nTop}, style]}>
		<PieceView style={{boxShadow: '5px 5px 50px #000000', backgroundColor: 'rgba(0, 0, 0, 0.6)'}} piece={logoBPiece} blockSize={blockSize}></PieceView>
		<PieceView style={{transform: [{ translateX: nLeft }, { translateY: nTop }], position: 'absolute', zIndex: -1}} piece={logoNPiece} blockSize={blockSize}></PieceView>
	</View>
}

export default function MainMenu() {
	const [ , appendAppState ] = useSetAppState();
	const { height } = useWindowDimensions();
	const isShortScreen = height < 700;
	const shopBalance = useAtomValue(shopStateAtom).balance;

	const startSoloMode = (mode: GameModeType) => {
		if (shouldCheckConnectionBeforeStart(mode)) {
			return;
		}
		appendAppState(mode);
	};
	
	return <View style={styles.container}>

		<Pressable
			onPress={() => appendAppState(MenuStateType.SHOP)}
			style={styles.shopButton}
		>
			<Text style={styles.shopButtonText}>SHOP</Text>
			<Text style={styles.shopBalanceText}>{shopBalance}</Text>
		</Pressable>

		<Pressable
			onPress={() => appendAppState(MenuStateType.ACHIEVEMENTS)}
			style={styles.achievementsButton}
		>
			<PixelIcon name="medal" size={27} color="#F0AF0C" secondaryColor="#FFFFFF" />
		</Pressable>

		<BlockerinoLogo style={{position: 'absolute', bottom: 10, left: 10}} blockSize={5}></BlockerinoLogo>
		<Animated.Text entering={BounceInUp.duration(800)} style={[styles.logo, isShortScreen && { fontSize: 32, marginBottom: 20 }]}>
			blockerino
		</Animated.Text>

		<MainButton
			onClick={() => {
				startSoloMode(GameModeType.Classic);
			}}
			backgroundColor={cssColors.brightNiceRed}
			title={"Classic 8x8"}
			flavorText={"classical line breaking"}
			idleBounce={true}
		/>
		<MainButton
			onClick={() => {
				startSoloMode(GameModeType.Chaos);
			}}
			backgroundColor={cssColors.pitchBlack}
			title={"Chaos !?"}
			flavorText={"10x10, 5 piece hand!?"}
			style={{ borderWidth: 2, borderColor: "rgb(50, 50, 50)" }}
			textStyle={{ color: "white" }}
			idleBounceRotate={true}
		/>
		<MainButton
			onClick={() => {
				appendAppState(MenuStateType.MULTIPLAYER);
			}}
			backgroundColor={cssColors.versusBlue}
			title={"Versus 1v1"}
			flavorText={"real-time duel"}
		/>
		<MainButton
			onClick={() => {
				appendAppState(MenuStateType.DAILY_CHALLENGES);
			}}
			backgroundColor={"#FFD700"}
			title={"Challenges"}
			flavorText={"daily puzzle & speed mode"}
		/>
		<MainButton onClick = {() => {
			appendAppState(MenuStateType.HIGH_SCORES)
		}} backgroundColor={cssColors.pink} title={"High Scores"} />
		<MainButton onClick = {() => {
			appendAppState(MenuStateType.OPTIONS)
		}} backgroundColor={cssColors.green} title={"Options"} />

		<Animated.Text entering={FadeIn} style={styles.footer}>
			beta version
		</Animated.Text>
	</View>
}

function MainButton({
	style,
	textStyle,
	backgroundColor,
	title,
	flavorText,
	idleBounce,
	idleBounceRotate,
	onClick,
}: {
	style?: any;
	textStyle?: any;
	backgroundColor: string;
	title: string;
	flavorText?: string;
	idleBounce?: boolean;
	idleBounceRotate?: boolean;
	onClick?: () => void;
}) {
	const scale = useSharedValue(1);
	const idleAnimTranslateY = useSharedValue(0);
	const hoverAnimTranslateY = useSharedValue(0);
	const translateY = useDerivedValue(() => {
		return idleAnimTranslateY.value + hoverAnimTranslateY.value; 
	});
	const rotationDeg = useSharedValue(0);
	const { height } = useWindowDimensions();
	const isShortScreen = height < 700;
	const allowIdleMotion = height >= 760;

	const animatedStyle = useAnimatedStyle(() => {
		return {
			transform: [
				{ translateY: translateY.value },
				{ rotate: `${rotationDeg.value}deg` },
				{ scale: scale.value }
			]
		};
	});

	useEffect(() => {
		const idleBounceTotalTime = 3700;
		if (!allowIdleMotion) {
			idleAnimTranslateY.value = 0;
			rotationDeg.value = 0;
			return;
		}

		if (idleBounce) {
			idleAnimTranslateY.value = withRepeat(
				withSequence(
					withDelay(2500, withTiming(-30, { duration: 200 })),
					withTiming(0, { duration: 1000, easing: Easing.bounce }),
				),
				1000,
			);
		} else if (idleBounceRotate) {
			const amplitude = 10;
			const steps = 5;
			const stepDuration = 160;
			const anims = [];
			for (let i = 0; i < steps; i++) {
				let deg;
				if (i === steps - 1) {
					deg = 0;
				} else {
					deg = i % 2 === 0 ? -amplitude : amplitude;
				}
				anims.push(
					withTiming(deg, { duration: stepDuration, easing: Easing.cubic }),
				);
			}

			rotationDeg.value = withRepeat(
				withDelay(
					idleBounceTotalTime - stepDuration * steps,
					withSequence(...anims),
				),
				1000,
			);
		}
	}, [allowIdleMotion, idleAnimTranslateY, idleBounce, idleBounceRotate, rotationDeg]);

	const onPress = () => {
		scale.value = withSequence(withTiming(1.25, { duration: 200 }), withTiming(1, { duration: 200 }));
		if (onClick)
			onClick();
	}
	
	const onHoverIn = () => {
		hoverAnimTranslateY.value = withSpring(-10, {duration: 400});
	}
	
	const onHoverOut = () => {
		hoverAnimTranslateY.value = withSpring(0, {duration: 400});
	}
	
	return (
		<Pressable 
			style={[
				styles.buttonPressable,
				isShortScreen && { height: 48, marginBottom: 12 }
			]} 
			onPress={onPress} 
			onHoverIn={onHoverIn} 
			onHoverOut={onHoverOut}
		>
			<Animated.View
				key={title}
				style={[
					styles.button,
					{ backgroundColor },
					animatedStyle,
					style ? style : {},
				]}
			>
				<Text style={[
					styles.buttonText, 
					textStyle ? textStyle : {},
					isShortScreen && { fontSize: 20 }
				]}>
					{title}
				</Text>
				{flavorText && (
					<Text style={[
						styles.buttonFlavorText, 
						textStyle ? textStyle : {},
						isShortScreen && { fontSize: 12 }
					]}>
						{flavorText}
					</Text>
				)}
			</Animated.View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		width: '100%',
		height: '100%'
	},
	logo: {
		fontFamily: "Silkscreen",
		fontSize: 40,
		color: "#FFF",
		marginBottom: 50,
		textAlign: "center",
	},
	button: {
		width: "100%",
		height: "100%",
		justifyContent: "center",
		alignItems: "center",
		marginBottom: 20,
		borderRadius: 8,
		borderWidth: 2
	},
	buttonPressable: {
		width: "80%",
		height: 60,
		justifyContent: "center",
		alignItems: "center",
		marginBottom: 20,
		borderRadius: 10,
		maxWidth: 420
	},
	buttonText: {
		fontFamily: "Silkscreen",
		fontSize: 24,
		color: "black",
		textAlign: 'center'
	},
	buttonFlavorText: {
		fontFamily: "Silkscreen",
		fontSize: 14,
		color: "rgb(30, 30, 30)",
		textAlign: 'center'
	},
	footer: {
		fontFamily: "Silkscreen",
		fontSize: 16,
		color: "#555",
		position: "absolute",
		bottom: 20,
	},
	achievementsButton: {
		position: "absolute",
		top: 24,
		right: 24,
		width: 46,
		height: 46,
		borderRadius: 12,
		backgroundColor: "rgba(20, 20, 20, 0.82)",
		borderWidth: 2,
		borderColor: "rgba(255, 255, 255, 0.22)",
		justifyContent: "center",
		alignItems: "center",
		zIndex: 20,
	},
	achievementsIcon: {
		fontFamily: "SilkscreenBold",
		fontSize: 12,
		color: "#F0AF0C",
		textAlign: "center",
	},
	shopButton: {
		position: "absolute",
		top: 24,
		left: 24,
		minWidth: 76,
		height: 46,
		borderRadius: 12,
		backgroundColor: "rgba(20, 20, 20, 0.82)",
		borderWidth: 2,
		borderColor: "rgba(255, 255, 255, 0.22)",
		justifyContent: "center",
		alignItems: "center",
		zIndex: 20,
		paddingHorizontal: 8,
	},
	shopButtonText: {
		fontFamily: "Silkscreen",
		fontSize: 12,
		color: "white",
		textAlign: "center",
	},
	shopBalanceText: {
		fontFamily: "Silkscreen",
		fontSize: 10,
		color: "#F0AF0C",
		textAlign: "center",
	},
});
