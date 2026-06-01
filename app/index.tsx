import {
	StyleSheet,
	LogBox,
} from "react-native";
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
import { MenuStateType, useAppState } from "@/hooks/useAppState";
import MainMenu from "@/components/MainMenu";
import HighScores from "@/components/HighScoresMenu";
import { PieceParticle } from "@/components/PieceParticle";
import AnimatedBackground from "@/components/AnimatedBackground";
import { getActiveGame, clearActiveGame, SavedGameState } from "@/constants/Storage";
import ContinueGameModal from "@/components/ContinueGameModal";
import MultiplayerMenu from "@/components/MultiplayerMenu";
import MultiplayerGame from "@/components/game/MultiplayerGame";
import DailyChallengesMenu from "@/components/DailyChallengesMenu";
import { useSoundSettings } from "@/constants/Sound";

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
	const { initialize: initSounds } = useSoundSettings();

	const [loaded] = useFonts({
		"Press-Start-2P": require("../assets/fonts/PressStart2P-Regular.ttf"),
		SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
		Silkscreen: require("../assets/fonts/Silkscreen-Regular.ttf"),
		SilkscreenBold: require("../assets/fonts/Silkscreen-Bold.ttf"),
	});

	const [ appState, setAppState ] = useAppState();
	const [ savedGame, setSavedGame ] = useState<SavedGameState | null>(null);
	const [ showContinueModal, setShowContinueModal ] = useState(false);

	// Multiplayer States
	const [ multiplayerRoomId, setMultiplayerRoomId ] = useState<string | null>(null);
	const [ multiplayerRole, setMultiplayerRole ] = useState<'player1' | 'player2' | 'spectator'>('player1');
	const [ opponentName, setOpponentName ] = useState('');
	const [ multiplayerGameMode, setMultiplayerGameMode ] = useState<GameModeType>(GameModeType.Classic);
	const [ multiplayerPlayerElo, setMultiplayerPlayerElo ] = useState(1000);

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
	}, [initSounds]);

	if (!loaded) return null;

	const gameModeSearch = appState?.containsGameMode();
	const gameMode = gameModeSearch ? gameModeSearch.current as GameModeType : undefined;
	const isMainMenuVisible = appState.current === MenuStateType.MENU && !gameMode;
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
	
	const isGameplayActive = gameMode !== undefined || !!appState.containsState(MenuStateType.MULTIPLAYER_GAME);

	return (
		<Animated.View entering={FadeIn} exiting={FadeOut} style={styles.container}>
			<AnimatedBackground isGameplayActive={isGameplayActive} />
			{!isGameplayActive && [...Array(25)].map((_, i) => (
				<PieceParticle key={`particle${i}`} />
			))}

			{ isMainMenuVisible && <MainMenu></MainMenu> }
			{ gameMode && <Game gameMode={gameMode} initialState={savedGameForCurrentMode || undefined}></Game> }
			{ appState.containsState(MenuStateType.OPTIONS) && <OptionsMenu></OptionsMenu> }
			{ appState.containsState(MenuStateType.HIGH_SCORES) && <HighScores></HighScores>}
			
			{ appState.containsState(MenuStateType.MULTIPLAYER) && (
				<MultiplayerMenu onStartGame={handleStartGame} />
			)}

			{ appState.containsState(MenuStateType.DAILY_CHALLENGES) && (
				<DailyChallengesMenu />
			)}

			{ appState.containsState(MenuStateType.MULTIPLAYER_GAME) && multiplayerRoomId && (
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
