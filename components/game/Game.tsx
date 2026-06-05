import { PieceData, getBlockCount } from '@/constants/Piece';
import { DndProvider, DndProviderProps, Rectangle } from '@mgcrea/react-native-dnd';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { ReduceMotion, runOnJS, useSharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { BoardBlockType, JS_emptyPossibleBoardSpots, PossibleBoardSpots, XYPoint, breakLines, clearHoverBlocks, createPossibleBoardSpots, emptyPossibleBoardSpots, newEmptyBoard, placePieceOntoBoard, updateHoveredBreaks, useGameSizes, createSeededBoard, cloneBoard, hasAnyPossibleMove } from '@/constants/Board';
import { StatsGameHud, StickyGameHud } from '@/components/game/GameHud';
import BlockGrid from '@/components/game/BlockGrid';
import { createRandomHand, createRandomHandWorklet, createSeededHand, getDailyPuzzleKey, getNumericSeedFromDate } from '@/constants/Hand';
import HandPieces from '@/components/game/HandPieces';
import { GameModeType, activeComboAtom } from '@/hooks/useAppState';
import { createHighScore, HighScoreId, updateHighScore, SavedGameState, saveActiveGame, clearActiveGame } from '@/constants/Storage';
import { useSoundSettings } from '@/constants/Sound';
import GameOverModal from '../GameOverModal';
import { ScorePopup } from './ScorePopup';
import { useAtom } from 'jotai';
import SecondChanceModal from '../SecondChanceModal';
import { applySecondChancePenalty, canUseSecondChance, getSecondChanceCost, SECOND_CHANCE_COSTS } from '@/constants/SecondChance';
import { getRandomPieceColor } from '@/constants/Piece';
import { recordAchievementProgress } from '@/constants/Achievements';


const SPRING_CONFIG_MISSED_DRAG = {
	mass: 1,
	damping: 1,
	stiffness: 500,
	overshootClamping: true,
	restDisplacementThreshold: 0.01,
	restSpeedThreshold: 0.01,
	reduceMotion: ReduceMotion.Never,
}

type SecondChanceReason = "moves" | "time";

function decodeDndId(id: string): XYPoint {
	"worklet";
	const parts = id.split(",");
	return {
		x: parts.length > 0 ? Number(parts[0]) : NaN,
		y: parts.length > 1 ? Number(parts[1]) : NaN
	};
}

function impactAsyncHelper(style: Haptics.ImpactFeedbackStyle) {
	Haptics.impactAsync(style);
}

function runPiecePlacedHaptic() {
	"worklet";
	runOnJS(impactAsyncHelper)(Haptics.ImpactFeedbackStyle.Light);
}

export const Game = (({gameMode, initialState}: {gameMode: GameModeType, initialState?: SavedGameState}) => {
	const boardLength = gameMode === GameModeType.Chaos ? 10 : 8;
	const { GRID_BLOCK_SIZE, DRAG_JUMP_LENGTH } = useGameSizes(boardLength);
	const handSize = gameMode === GameModeType.Chaos ? 5 : 3;

	const isDaily = gameMode === GameModeType.DailyPuzzle;
	const dailyKey = isDaily ? getDailyPuzzleKey() : undefined;
	const dailySeed = isDaily ? getNumericSeedFromDate(`${dailyKey}:daily-puzzle-v2`) : 0;
	const canUseInitialState = initialState && (!isDaily || initialState.dailyKey === dailyKey);
	const handCount = useSharedValue(canUseInitialState ? (initialState as any).handCount || 0 : 0);

	const board = useSharedValue(
		canUseInitialState 
			? initialState.board 
			: (isDaily ? createSeededBoard(boardLength, dailySeed) : newEmptyBoard(boardLength))
	);
	const draggingPiece = useSharedValue<number | null>(null);
	const possibleBoardDropSpots = useSharedValue<PossibleBoardSpots>(JS_emptyPossibleBoardSpots(boardLength));
	const hand = useSharedValue(
		canUseInitialState 
			? initialState.hand 
			: (isDaily ? createSeededHand(handSize, dailySeed + 1 + handCount.value) : createRandomHand(handSize, gameMode))
	);
	const score = useSharedValue(canUseInitialState ? initialState.score : 0);
	const combo = useSharedValue(canUseInitialState ? initialState.combo : 0);
	// How many moves ago was the last broken line?
	const lastBrokenLine = useSharedValue(canUseInitialState ? initialState.lastBrokenLine : 0);

	// Time Attack mode timer remaining state
	const timeRemaining = useSharedValue(canUseInitialState ? (initialState as any).timeRemaining || 60 : 60);

	// Состояние для отображения модального окна проигрыша
	const [isGameOver, setIsGameOver] = useState(false);
	const [secondChanceReason, setSecondChanceReason] = useState<SecondChanceReason | null>(null);
	const secondChancesUsed = useSharedValue(canUseInitialState ? (initialState as any).secondChancesUsed || 0 : 0);
	const [scorePopups, setScorePopups] = useState<{id: number, points: number, x: number, y: number}[]>([]);
	const scorePopupIdCounter = useRef(0);

	const addScorePopup = (points: number, x: number, y: number) => {
		const id = scorePopupIdCounter.current++;
		setScorePopups(prev => [...prev, { id, points, x, y }]);
	};
	
	const removeScorePopup = (id: number) => {
		removeScorePopupHelper(id);
	};

	const removeScorePopupHelper = (id: number) => {
		setScorePopups(prev => prev.filter(p => p.id !== id));
	};

	const scoreStorageId = useSharedValue<HighScoreId | undefined>(canUseInitialState ? initialState.scoreStorageId : undefined);
	const { playSfx, playComboSound, initialize } = useSoundSettings();

	const [, setActiveCombo] = useAtom(activeComboAtom);
	const isMountedRef = useRef(true);
	const isGameOverRef = useRef(false);
	const secondChanceDecisionLockedRef = useRef(false);

	const updateActiveCombo = (val: number) => {
		if (!isMountedRef.current || isGameOverRef.current) return;
		setActiveCombo(val);
	};

	const createSecondChanceHand = () => {
		const nextHand = createRandomHand(handSize, gameMode);
		nextHand[0] = {
			matrix: [[1]],
			distributionPoints: 6,
			color: getRandomPieceColor(),
		};
		return nextHand;
	};

	const createSecondChanceBoard = () => {
		const nextBoard = board.value.map((row) => row.map((cell) => ({ ...cell })));
		const start = Math.max(0, Math.floor(boardLength / 2) - 1);
		const end = Math.min(boardLength, start + 3);

		for (let y = start; y < end; y++) {
			for (let x = start; x < end; x++) {
				nextBoard[y][x] = {
					...nextBoard[y][x],
					blockType: BoardBlockType.EMPTY,
					color: getRandomPieceColor(),
					hoveredBreakColor: { r: 0, g: 0, b: 0 },
				};
			}
		}

		return nextBoard;
	};

	const saveCurrentGame = (nextBoard = board.value, nextHand = hand.value, nextSecondChancesUsed = secondChancesUsed.value) => {
		saveActiveGame({
			gameMode,
			board: nextBoard,
			hand: nextHand,
			score: score.value,
			combo: combo.value,
			lastBrokenLine: lastBrokenLine.value,
			scoreStorageId: scoreStorageId.value,
			timeRemaining: timeRemaining.value,
			handCount: handCount.value,
			dailyKey,
			secondChancesUsed: nextSecondChancesUsed,
		} as any);
	};

	const finishGame = () => {
		isGameOverRef.current = true;
		setActiveCombo(0);
		secondChanceDecisionLockedRef.current = true;
		setSecondChanceReason(null);
		setIsGameOver(true);
		recordAchievementProgress({ soloGamesFinished: 1 });
		clearActiveGame();
	};

	const startSecondChanceOrFinish = (reason: SecondChanceReason) => {
		if (canUseSecondChance(secondChancesUsed.value)) {
			setSecondChanceReason(reason);
			return;
		}

		finishGame();
	};

	const acceptSecondChance = () => {
		const nextSecondChancesUsed = secondChancesUsed.value + 1;
		const nextScore = applySecondChancePenalty(score.value, secondChancesUsed.value);
		const nextBoard = createSecondChanceBoard();
		const nextHand = createSecondChanceHand();

		score.value = nextScore;
		board.value = nextBoard;
		hand.value = nextHand;
		combo.value = 0;
		lastBrokenLine.value = 0;
		if (gameMode === GameModeType.TimeAttack) {
			timeRemaining.value = Math.max(timeRemaining.value, 15);
		}

		setActiveCombo(0);
		secondChancesUsed.value = nextSecondChancesUsed;
		setSecondChanceReason(null);
		recordAchievementProgress({ secondChancesUsed: 1 });

		if (scoreStorageId.value) {
			updateHighScore(scoreStorageId.value, {
				score: nextScore,
				date: new Date().getTime(),
				type: gameMode,
			});
		}

		saveCurrentGame(nextBoard, nextHand, nextSecondChancesUsed);
	};

	const pieceOverlapsRectangle = (layout: Rectangle, other: Rectangle) => {
		"worklet";
		if (other.width === 0 && other.height === 0) {
			return false;
		}

		return (
			layout.x < other.x + other.width &&
			layout.x + GRID_BLOCK_SIZE > other.x &&
			layout.y - DRAG_JUMP_LENGTH < other.y + other.height &&
			layout.y - DRAG_JUMP_LENGTH + GRID_BLOCK_SIZE > other.y
		);
	};

	useEffect(() => {
		initialize();
		setActiveCombo(0);
		return () => {
			isMountedRef.current = false;
			setActiveCombo(0);
		};
	}, []);

	useEffect(() => {
		if (gameMode !== GameModeType.TimeAttack || isGameOver || secondChanceReason) return;
		
		const timer = setInterval(() => {
			if (timeRemaining.value > 0) {
				timeRemaining.value = Math.max(0, timeRemaining.value - 1);
				if (timeRemaining.value <= 0) {
					startSecondChanceOrFinish("time");
				}
			}
		}, 1000);

		return () => clearInterval(timer);
	}, [gameMode, isGameOver, secondChanceReason]);

	useEffect(() => {
		if (scoreStorageId.value !== undefined) return;
		createHighScore({score: score.value, date: new Date().getTime(), type: gameMode}).then((id) => {
			scoreStorageId.value = id;
		});
	}, [scoreStorageId]);

	// Проверка наличия возможных ходов
	const checkForPossibleMoves = () => {
		// Проверяем каждую фигуру в руке
		for (let i = 0; i < hand.value.length; i++) {
			const piece = hand.value[i];
			if (!piece) continue;
			
			// Получаем возможные места для этой фигуры
			const possibleSpots = createPossibleBoardSpots(board.value, piece);
			
			// Проверяем, есть ли хоть одно возможное место
			for (let y = 0; y < possibleSpots.length; y++) {
				for (let x = 0; x < possibleSpots[y].length; x++) {
					if (possibleSpots[y][x] === 1) {
						return true; // Есть хотя бы одно возможное место
					}
				}
			}
		}
		
		// Если дошли до сюда, значит нет возможных ходов
		return false;
	};

	const handleDragEnd: DndProviderProps["onDragEnd"] = ({ active, over }) => {
		"worklet";
		if (over) {
			if (draggingPiece.value == null) {
				return;
			}

			const dropIdStr = over.id.toString();
			const {x: dropX, y: dropY} = decodeDndId(dropIdStr);
			if (isNaN(dropX) || isNaN(dropY)) {
				draggingPiece.value = null;
				possibleBoardDropSpots.value = emptyPossibleBoardSpots(boardLength);
				return;
			}
			const piece: PieceData = hand.value[draggingPiece.value!]!;

			// the block is gonna fit, let's place the block
			// we'll do the haptics now
			if (Platform.OS !== 'web') {
				runPiecePlacedHaptic();
			} else {
				if (typeof navigator !== 'undefined' && navigator.vibrate) {
					navigator.vibrate(15);
				}
			}
			
			// Звук размещения блока
			runOnJS(playSfx)('placeBlock');

			const newBoard = clearHoverBlocks(cloneBoard(board.value));
			placePieceOntoBoard(newBoard, piece, dropX, dropY, BoardBlockType.FILLED);

			const linesBroken = breakLines(newBoard);
			
			// add score from placing block
			const pieceBlockCount = getBlockCount(piece);
			let pointsEarned = pieceBlockCount;
			
			if (linesBroken > 0) {
				lastBrokenLine.value = 0;
				combo.value += linesBroken;
				
				 // Улучшенный звук разрушения линий с учетом комбо
				runOnJS(playComboSound)(combo.value);
				runOnJS(updateActiveCombo)(combo.value);
				
				if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.vibrate) {
					navigator.vibrate([25, 45, 25]);
				}
				
				// line break score + combo multiplier stuff
				pointsEarned += linesBroken * boardLength * (combo.value / 2) * pieceBlockCount;
				score.value += pointsEarned;

				// Time Attack: +5s per broken line
				if (gameMode === GameModeType.TimeAttack) {
					timeRemaining.value = Math.min(99, timeRemaining.value + linesBroken * 5);
				}
			} else {
				score.value += pointsEarned;
				lastBrokenLine.value++;
				if (lastBrokenLine.value >= handSize) {
					combo.value = 0;
					runOnJS(updateActiveCombo)(0);
				}
			}

			// Time Attack: +1s per 15 points
			if (gameMode === GameModeType.TimeAttack) {
				timeRemaining.value = Math.min(99, timeRemaining.value + Math.floor(pointsEarned / 15));
			}
			runOnJS(recordAchievementProgress)({ totalPiecesPlaced: 1, totalLinesCleared: linesBroken });
			
			runOnJS(addScorePopup)(pointsEarned, dropX * GRID_BLOCK_SIZE, dropY * GRID_BLOCK_SIZE);
			
			if (scoreStorageId.value) {
				runOnJS(updateHighScore)(scoreStorageId.value!, {
					score: score.value, 
					date: new Date().getTime(), 
					type: gameMode
				});
			}
			
			const newHand = [...hand.value];
			newHand[draggingPiece.value!] = null;

			// is hand empty?
			let empty = true;
			for (let i = 0; i < handSize; i++) {
				if (newHand[i] != null) {
					empty = false;
					break;
				}
			}
			
			let nextHand;
			if (empty) {
				if (isDaily) {
					handCount.value += 1;
					nextHand = createSeededHand(handSize, dailySeed + 1 + handCount.value);
				} else {
					nextHand = createRandomHandWorklet(handSize, gameMode);
				}
			} else {
				nextHand = newHand;
			}
			hand.value = nextHand;
			
			board.value = newBoard;

			// Сохраняем состояние текущей игры
			runOnJS(saveCurrentGame)(newBoard, nextHand, secondChancesUsed.value);
			
			// Проверка игры на окончание после обновления руки
			if (!hasAnyPossibleMove(newBoard, nextHand)) {
				runOnJS(startSecondChanceOrFinish)("moves");
			}
		} else {
			board.value = clearHoverBlocks(cloneBoard(board.value));
			// Звук неудачного размещения
			runOnJS(playSfx)('invalidPlacement');
		}
		
		draggingPiece.value = null;
		possibleBoardDropSpots.value = emptyPossibleBoardSpots(boardLength);
	};

	const handleBegin: DndProviderProps["onBegin"] = (event, meta) => {
		"worklet";
		const handIndex = Number(meta.activeId.toString());
		if (hand.value[handIndex] != null) {
			draggingPiece.value = handIndex;
			possibleBoardDropSpots.value = createPossibleBoardSpots(board.value, hand.value[handIndex]);
		}
	};

	const handleFinalize: DndProviderProps["onFinalize"] = ({ state }) => {
		"worklet";
		if (state !== State.END) {
			draggingPiece.value = null;
		}
	};

	const handleUpdate: DndProviderProps["onUpdate"] = (event, {activeId, activeLayout, droppableActiveId}) => {
		"worklet";
		if (!droppableActiveId) {
			board.value = clearHoverBlocks([...board.value]);
			return;
		}

		if (draggingPiece.value == null) {
			return;
		}

		const dropIdStr = droppableActiveId.toString();
		if (dropIdStr === "trash") {
			board.value = clearHoverBlocks([...board.value]);
			return;
		}

		const {x: dropX, y: dropY} = decodeDndId(dropIdStr);
		if (isNaN(dropX) || isNaN(dropY)) {
			board.value = clearHoverBlocks([...board.value]);
			return;
		}
		const piece: PieceData = hand.value[draggingPiece.value!]!;

		const newBoard = clearHoverBlocks([...board.value]);
		updateHoveredBreaks(newBoard, piece, dropX, dropY);

		board.value = newBoard;
	};
	
	return (        
		<SafeAreaView style={[styles.root, { backgroundColor: 'transparent' }]}>
			<GestureHandlerRootView style={styles.root}>
				<View style={styles.root}>
					<StickyGameHud gameMode={gameMode} score={score}></StickyGameHud>
					<DndProvider shouldDropWorklet={pieceOverlapsRectangle} springConfig={SPRING_CONFIG_MISSED_DRAG} onBegin={handleBegin} onFinalize={handleFinalize} onDragEnd={handleDragEnd} onUpdate={handleUpdate}>
						<StatsGameHud score={score} combo={combo} lastBrokenLine={lastBrokenLine} hand={hand} gameMode={gameMode} timeRemaining={timeRemaining}></StatsGameHud>
						<BlockGrid board={board} possibleBoardDropSpots={possibleBoardDropSpots} hand={hand} draggingPiece={draggingPiece}></BlockGrid>
						<View style={[StyleSheet.absoluteFill, { pointerEvents: 'none', zIndex: 9999 }]}>
							{scorePopups.map(popup => (
								<ScorePopup 
									key={popup.id} 
									points={popup.points} 
									x={popup.x + 30} // Смещение для выравнивания
									y={popup.y + 100} // Смещение относительно BlockGrid
									onComplete={() => removeScorePopup(popup.id)} 
								/>
							))}
						</View>
						<HandPieces 
							hand={hand} 
							boardSize={boardLength}
							onHandChange={(newHand) => {
								saveCurrentGame(board.value, newHand, secondChancesUsed.value);
							}}
						/>
					</DndProvider>

					{secondChanceReason && (
						<SecondChanceModal
							cost={getSecondChanceCost(secondChancesUsed.value)}
							currentScore={Math.floor(score.value)}
							chancesRemaining={Math.max(0, SECOND_CHANCE_COSTS.length - secondChancesUsed.value - 1)}
							reason={secondChanceReason}
							onAccept={acceptSecondChance}
							onDecline={finishGame}
						/>
					)}
					
					{isGameOver && (
						<GameOverModal score={Math.floor(score.value)} gameMode={gameMode} />
					)}
				</View>
			</GestureHandlerRootView>
		</SafeAreaView>
	);
});

const styles = StyleSheet.create({
	root: {
		width: '100%',
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 0,
		overflow: 'hidden',
	},
	handRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		width: '100%',
		gap: 15,
		marginTop: 10,
	}
});

export default Game;
