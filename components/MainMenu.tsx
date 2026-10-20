import { useEffect } from "react";
import { Platform, Pressable, StyleSheet, Text, View, ViewStyle, useWindowDimensions } from "react-native";
import Animated, { BounceInUp, Easing, FadeIn, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { MenuStateType, useSetAppState } from "@/hooks/useAppState";
import { cssColors } from "@/constants/Color";
import { GameModeType } from '@/hooks/useAppState';
import { PieceData } from "@/constants/Piece";
import { PieceView } from "./PieceView";
import { shopStateAtom } from "@/constants/Shop";
import { dailyRewardOpenAtom, dailyRewardStatusAtom } from "@/constants/DailyReward";
import UiIcon from "@/components/UiIcon";
import { useAtomValue, useSetAtom } from "jotai";
import { shouldCheckConnectionBeforeStart } from "@/constants/GameStart";
import PixelIcon from "./PixelIcon";
import { useLanguage } from "@/constants/Localization";

const CHAOS_VIOLET = "#7C3AED";

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

// Big web screens get the logo and buttons scaled up as one block; phones and native stay at 1.
export function getMainMenuScale(width: number, height: number): number {
	if (Platform.OS !== "web") return 1;
	const scale = Math.min((width * 0.8) / 420, (height * 0.85) / 640, 2);
	return scale > 1.05 ? Math.round(scale * 100) / 100 : 1;
}

export default function MainMenu() {
	const { t } = useLanguage();
	const [ , appendAppState ] = useSetAppState();
	const { width, height } = useWindowDimensions();
	const menuScale = getMainMenuScale(width, height);
	const isShortScreen = height < 700;
	const shopBalance = useAtomValue(shopStateAtom).balance;
	const streakStatus = useAtomValue(dailyRewardStatusAtom);
	const setDailyRewardOpen = useSetAtom(dailyRewardOpenAtom);

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
			<Text style={styles.shopButtonText}>{t("mainmenu.shop")}</Text>
			<Text style={styles.shopBalanceText}>{shopBalance}</Text>
		</Pressable>

		{streakStatus && (
			<Pressable onPress={() => setDailyRewardOpen(true)} style={styles.streakButton}>
				<UiIcon name="fire" size={18} dimmed={streakStatus.streak === 0} />
				<Text style={[styles.streakText, streakStatus.claimedToday ? styles.streakDone : styles.streakPending]}>{streakStatus.streak}</Text>
			</Pressable>
		)}

		<Pressable
			onPress={() => appendAppState(MenuStateType.PROFILE)}
			style={styles.profileButton}
			accessibilityLabel={t("mainmenu.profile")}
		>
			<UiIcon name="people" size={27} />
		</Pressable>

		<Pressable
			onPress={() => appendAppState(MenuStateType.ACHIEVEMENTS)}
			style={styles.achievementsButton}
		>
			<PixelIcon name="medal" size={27} color="#F0AF0C" secondaryColor="#FFFFFF" />
		</Pressable>

		<BlockerinoLogo style={{position: 'absolute', bottom: 10, left: 10}} blockSize={5}></BlockerinoLogo>
		<View style={[{ width: '100%', alignItems: 'center' }, menuScale > 1 && { transform: [{ scale: menuScale }] }]}>
		<Animated.Text entering={BounceInUp.duration(800)} style={[styles.logo, isShortScreen && { fontSize: 32, marginBottom: 16 }]}>
			blockerino
		</Animated.Text>

		<MainButton
			onClick={() => {
				startSoloMode(GameModeType.Classic);
			}}
			backgroundColor={cssColors.brightNiceRed}
			title={t("mainmenu.classicTitle")}
			flavorText={t("mainmenu.classicFlavor")}
			idleBounce={true}
		/>
		<MainButton
			onClick={() => {
				startSoloMode(GameModeType.Chaos);
			}}
			backgroundColor={CHAOS_VIOLET}
			title={t("mainmenu.chaosTitle")}
			flavorText={t("mainmenu.chaosFlavor")}
			style={{ borderWidth: 2, borderColor: "#A78BFA" }}
			textStyle={{ color: "white" }}
			idleBounceRotate={true}
		/>
		<MainButton
			onClick={() => {
				appendAppState(MenuStateType.MULTIPLAYER);
			}}
			backgroundColor={cssColors.versusBlue}
			title={t("mainmenu.versusTitle")}
			flavorText={t("mainmenu.versusFlavor")}
		/>
		<View style={[styles.rowWrap, isShortScreen && { marginBottom: 8 }]}>
			<MainTile
				title={t("mainmenu.challengesTitle")}
				color="#FFD700"
				onClick={() => appendAppState(MenuStateType.DAILY_CHALLENGES)}
			/>
			<MainTile
				title={t("mainmenu.moreGamesTitle")}
				color="#38BDF8"
				onClick={() => appendAppState(MenuStateType.MORE_GAMES)}
			/>
		</View>
		<View style={[styles.rowWrap, styles.quietRow]}>
			<QuietButton title={t("mainmenu.highScoresTitle")} onClick={() => appendAppState(MenuStateType.HIGH_SCORES)} />
			<QuietButton title={t("mainmenu.optionsTitle")} onClick={() => appendAppState(MenuStateType.OPTIONS)} />
		</View>
		</View>

		<Animated.Text entering={FadeIn} style={styles.footer}>
			{t("mainmenu.betaVersion")}
		</Animated.Text>
	</View>
}

// Secondary destinations share a row: a dark tile with a coloured outline, so the three game modes above stay the
// loudest thing on the screen.
function MainTile({ title, color, onClick }: { title: string; color: string; onClick: () => void }) {
	const { height } = useWindowDimensions();
	return (
		<Pressable
			onPress={onClick}
			style={({ pressed }) => [
				styles.tile,
				{ borderColor: color, backgroundColor: "rgba(255, 255, 255, 0.06)" },
				height < 700 && { height: 40 },
				pressed && { opacity: 0.7 },
			]}
		>
			<Text style={[styles.tileText, { color }]}>{title}</Text>
		</Pressable>
	);
}

function QuietButton({ title, onClick }: { title: string; onClick: () => void }) {
	const { height } = useWindowDimensions();
	return (
		<Pressable
			onPress={onClick}
			style={({ pressed }) => [styles.quietButton, height < 700 && { height: 32 }, pressed && { opacity: 0.7 }]}
		>
			<Text style={styles.quietText}>{title}</Text>
		</Pressable>
	);
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
				isShortScreen && { height: 44, marginBottom: 8 }
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
					isShortScreen && { fontSize: 18 }
				]}>
					{title}
				</Text>
				{flavorText && (
					<Text style={[
						styles.buttonFlavorText, 
						textStyle ? textStyle : {},
						isShortScreen && { fontSize: 10 }
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
		marginBottom: 28,
		textAlign: "center",
	},
	button: {
		width: "100%",
		height: "100%",
		justifyContent: "center",
		alignItems: "center",
		marginBottom: 14,
		borderRadius: 8,
		borderWidth: 2
	},
	buttonPressable: {
		width: "80%",
		height: 56,
		justifyContent: "center",
		alignItems: "center",
		marginBottom: 14,
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
	profileButton: {
		position: "absolute",
		top: 24,
		right: 78,
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
	rowWrap: {
		width: "80%",
		maxWidth: 420,
		flexDirection: "row",
		gap: 10,
		marginBottom: 14,
	},
	quietRow: {
		marginTop: 4,
	},
	tile: {
		flex: 1,
		height: 52,
		borderRadius: 8,
		borderWidth: 2,
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 6,
	},
	tileText: {
		fontFamily: "Silkscreen",
		fontSize: 15,
		textAlign: "center",
	},
	quietButton: {
		flex: 1,
		height: 38,
		borderRadius: 8,
		borderWidth: 1.5,
		borderColor: "rgba(255, 255, 255, 0.28)",
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 6,
	},
	quietText: {
		fontFamily: "Silkscreen",
		fontSize: 13,
		color: "rgba(255, 255, 255, 0.72)",
		textAlign: "center",
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
	streakButton: {
		position: "absolute",
		top: 24,
		left: 110,
		minWidth: 56,
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
	streakText: {
		fontFamily: "Silkscreen",
		fontSize: 12,
		textAlign: "center",
	},
	streakDone: {
		color: "#F0AF0C",
	},
	streakPending: {
		color: "#FF6B6B",
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
