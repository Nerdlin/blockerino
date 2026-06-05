import {
	StyleSheet,
	LogBox,
	AppState,
	Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import Animated, {
	FadeIn,
	FadeOut,
	ReanimatedLogLevel,
	configureReanimatedLogger,
} from "react-native-reanimated";
import Game from "@/components/game/Game";
import { GameModeType } from '@/hooks/useAppState';
import React, { useState, useEffect } from "react";
import OptionsMenu from "@/components/OptionsMenu";
import { MenuStateType, useAppState, multiplayerRoomIdAtom, multiplayerRoleAtom, multiplayerGameModeAtom } from "@/hooks/useAppState";
import MainMenu from "@/components/MainMenu";
import { useAtom, useAtomValue } from "jotai";
import HighScores from "@/components/HighScoresMenu";
import { PieceParticle } from "@/components/PieceParticle";
import AnimatedBackground from "@/components/AnimatedBackground";
import { getActiveGame, clearActiveGame, SavedGameState } from "@/constants/Storage";
import ContinueGameModal from "@/components/ContinueGameModal";
import MultiplayerMenu from "@/components/MultiplayerMenu";
import MultiplayerGame from "@/components/game/MultiplayerGame";
import DailyChallengesMenu from "@/components/DailyChallengesMenu";
import { shouldPauseMusicForAppState, soundManager, useSoundSettings } from "@/constants/Sound";
import MultiplayerConnectionGate from "@/components/MultiplayerConnectionGate";
import AchievementsMenu from "@/components/AchievementsMenu";
import ShopMenu from "@/components/ShopMenu";
import ProfileMenu from "@/components/ProfileMenu";
import { getBackgroundParticleConfig, shopStateAtom, useShopBootstrap } from "@/constants/Shop";
import { useInviteListener } from "@/hooks/useInviteListener";
import { DEFAULT_ELO } from "@/constants/Multiplayer";

// Suppress noisy library-specific deprecation warnings in developer tools
LogBox.ignoreLogs([
	"findDOMNode is deprecated",
	"props.pointerEvents is deprecated",
	"pointerEvents is deprecated"
]);

configureReanimatedLogger({
	level: ReanimatedLogLevel.warn,
	strict: false,
});

export default function App() {
	const { initialize: initSounds } = useSoundSettings({ manageMusicPlayback: true });
	useShopBootstrap();
	const shopState = useAtomValue(shopStateAtom);

	const [loaded] = useFonts({
		"Press-Start-2P": require("../assets/fonts/PressStart2P-Regular.ttf"),
		SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
		Silkscreen: require("../assets/fonts/Silkscreen-Regular.ttf"),
		SilkscreenBold: require("../assets/fonts/Silkscreen-Bold.ttf"),
	});

	const [ appState, setAppState, , popAppState ] = useAppState();
	const currentAppState = appState.current;
	const [ savedGame, setSavedGame ] = useState<SavedGameState | null>(null);
	const [ showContinueModal, setShowContinueModal ] = useState(false);
	const [ multiplayerConnectionReady, setMultiplayerConnectionReady ] = useState(false);
	const [ clientEffectsReady, setClientEffectsReady ] = useState(Platform.OS !== "web");

	// Multiplayer States
	const [ multiplayerRoomId, setMultiplayerRoomId ] = useAtom(multiplayerRoomIdAtom);
	const [ multiplayerRole, setMultiplayerRole ] = useAtom(multiplayerRoleAtom);
	const [ opponentName, setOpponentName ] = useState('');
	const [ multiplayerGameMode, setMultiplayerGameMode ] = useAtom(multiplayerGameModeAtom);
	const [ multiplayerPlayerElo, setMultiplayerPlayerElo ] = useState(DEFAULT_ELO);

	useInviteListener(setMultiplayerRoomId, setMultiplayerRole, setMultiplayerGameMode as any);

	useEffect(() => {
		// Initialize sounds at app startup
		initSounds();

		// On startup, check for active saved game
		getActiveGame().then((game) => {
			if (game) {
				setSavedGame(game);
				setShowContinueModal(true);
			}
		});
	}, []);

	useEffect(() => {
		if (Platform.OS === "web") {
			setClientEffectsReady(true);
		}
	}, []);

	useEffect(() => {
		const subscription = AppState.addEventListener("change", (nextAppState) => {
			if (shouldPauseMusicForAppState(nextAppState)) {
				soundManager.pauseMusic();
			}
		});

		return () => subscription.remove();
	}, []);

	useEffect(() => {
		if (currentAppState !== MenuStateType.MULTIPLAYER) {
			setMultiplayerConnectionReady(false);
		}
	}, [currentAppState]);

	if (Platform.OS !== "web" && !loaded) return null;

	const gameModeSearch = appState?.containsGameMode();
	const gameMode = gameModeSearch ? gameModeSearch.current as GameModeType : undefined;
	const isMainMenuVisible = currentAppState === MenuStateType.MENU && !gameMode;
	const isMultiplayerMenuVisible = currentAppState === MenuStateType.MULTIPLAYER;
	const savedGameForCurrentMode = gameMode && savedGame?.gameMode === gameMode ? savedGame : undefined;

	// Once the game starts, clear the savedGame ref in index.tsx state
	// so it does not get passed to future games.
	if (gameMode && savedGame) {
		setTimeout(() => {
			setSavedGame(null);
		}, 0);
	}

	const handleContinue = () => {
		if (savedGame) {
			setAppState(savedGame.gameMode);
			setShowContinueModal(false);
		}
	};

	const handleStartOver = async () => {
		await clearActiveGame();
		setSavedGame(null);
		setShowContinueModal(false);
	};

	const handleStartGame = (roomId: string, role: 'player1' | 'player2' | 'spectator', oppName: string, mode: GameModeType, playerElo: number) => {
		setMultiplayerRoomId(roomId);
		setMultiplayerRole(role);
		setOpponentName(oppName);
		setMultiplayerGameMode(mode);
		setMultiplayerPlayerElo(playerElo);
		setAppState(MenuStateType.MULTIPLAYER_GAME);
	};
	
	const isMultiplayerGameVisible = !!appState.containsState(MenuStateType.MULTIPLAYER_GAME) && !!multiplayerRoomId;
	const isGameplayActive = gameMode !== undefined || isMultiplayerGameVisible;
	const particleConfig = getBackgroundParticleConfig(shopState.equipped.background, isGameplayActive);

	return (
		<>
		<StatusBar style="light" backgroundColor="#050510" translucent={false} />
		<Animated.View entering={FadeIn} exiting={FadeOut} style={styles.container}>
			<AnimatedBackground isGameplayActive={isGameplayActive} />
			{clientEffectsReady && [...Array(particleConfig.count)].map((_, i) => (
				<PieceParticle
					key={`particle${i}-${isGameplayActive ? 'game' : 'menu'}`}
					blockSize={particleConfig.blockSize}
					maxOpacity={particleConfig.maxOpacity}
				/>
			))}

			{ isMainMenuVisible && <MainMenu></MainMenu> }
			{ gameMode && <Game gameMode={gameMode} initialState={savedGameForCurrentMode || undefined}></Game> }
			{ appState.containsState(MenuStateType.OPTIONS) && !appState.containsState(MenuStateType.PROFILE) && <OptionsMenu></OptionsMenu> }
			{ appState.containsState(MenuStateType.HIGH_SCORES) && <HighScores></HighScores>}
			{ appState.containsState(MenuStateType.ACHIEVEMENTS) && <AchievementsMenu />}
			{ appState.containsState(MenuStateType.SHOP) && <ShopMenu />}
			{ appState.containsState(MenuStateType.PROFILE) && <ProfileMenu />}
			
			{ isMultiplayerMenuVisible && (
				multiplayerConnectionReady ? (
					<MultiplayerMenu onStartGame={handleStartGame} />
				) : (
					<MultiplayerConnectionGate
						onConnected={() => setMultiplayerConnectionReady(true)}
						onBack={popAppState}
					/>
				)
			)}

			{ appState.containsState(MenuStateType.DAILY_CHALLENGES) && (
				<DailyChallengesMenu />
			)}

			{ isMultiplayerGameVisible && (
				<MultiplayerGame
					roomId={multiplayerRoomId}
					myRole={multiplayerRole}
					opponentName={opponentName}
					gameMode={multiplayerGameMode}
					initialPlayerElo={multiplayerPlayerElo}
				/>
			)}

			{ showContinueModal && savedGame && (
				<ContinueGameModal
					score={savedGame.score}
					gameMode={savedGame.gameMode}
					onContinue={handleContinue}
					onStartOver={handleStartOver}
				/>
			)}
		</Animated.View>
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "black",
		alignItems: "center",
		justifyContent: "center",
		width: '100%',
		height: '100%'
	}
});
