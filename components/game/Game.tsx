import { PieceData, getBlockCount } from '@/constants/Piece';
import { DndProvider, DndProviderProps, Rectangle } from '@mgcrea/react-native-dnd';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, SafeAreaView, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { ReduceMotion, runOnJS, useSharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { BoardBlockType, JS_emptyPossibleBoardSpots, PossibleBoardSpots, XYPoint, breakLines, clearHoverBlocks, createPossibleBoardSpots, emptyPossibleBoardSpots, newEmptyBoard, placePieceOntoBoard, updateHoveredBreaks, useGameSizes } from '@/constants/Board';
import { StatsGameHud, StickyGameHud } from '@/components/game/GameHud';
import BlockGrid from '@/components/game/BlockGrid';
import { createRandomHand, createRandomHandWorklet } from '@/constants/Hand';
import HandPieces from '@/components/game/HandPieces';
import { GameModeType } from '@/hooks/useAppState';
import { createHighScore, HighScoreId, updateHighScore, SavedGameState, saveActiveGame, clearActiveGame } from '@/constants/Storage';
import { useSoundSettings } from '@/constants/Sound';
import { useTheme } from '@/constants/Theme';
import GameOverModal from '../GameOverModal';
import { ScorePopup } from './ScorePopup';


const SPRING_CONFIG_MISSED_DRAG = {
	mass: 1,
	damping: 1,
	stiffness: 500,
	overshootClamping: true,
	restDisplacementThreshold: 0.01,
	restSpeedThreshold: 0.01,
	reduceMotion: ReduceMotion.Never,
}

function decodeDndId(id: string): XYPoint {
	"worklet";
	return {x: Number(id[0]), y: Number(id[2])}
}

function impactAsyncHelper(style: Haptics.ImpactFeedbackStyle) {
	Haptics.impactAsync(style);
}

function runPiecePlacedHaptic() {
	"worklet";
	runOnJS(impactAsyncHelper)(Haptics.ImpactFeedbackStyle.Light);
}

export const Game = (({gameMode, initialState}: {gameMode: GameModeType, initialState?: SavedGameState}) => {
	const boardLength = gameMode == GameModeType.Chaos ? 10 : 8;
	const { GRID_BLOCK_SIZE, DRAG_JUMP_LENGTH } = useGameSizes(boardLength);
	const handSize = gameMode == GameModeType.Chaos ? 5 : 3;
	const board = useSharedValue(initialState ? initialState.board : newEmptyBoard(boardLength));
	const draggingPiece = useSharedValue<number | null>(null);
	const possibleBoardDropSpots = useSharedValue<PossibleBoardSpots>(JS_emptyPossibleBoardSpots(boardLength));
	const hand = useSharedValue(initialState ? initialState.hand : createRandomHand(handSize));
	const score = useSharedValue(initialState ? initialState.score : 0);
	const combo = useSharedValue(initialState ? initialState.combo : 0);
	// How many moves ago was the last broken line?
	const lastBrokenLine = useSharedValue(initialState ? initialState.lastBrokenLine : 0);
	// Состояние для отображения модального окна проигрыша
	const [isGameOver, setIsGameOver] = useState(false);
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

	const scoreStorageId = useSharedValue<HighScoreId | undefined>(initialState ? initialState.scoreStorageId : undefined);
	const { currentTheme } = useTheme();
	const { playSfx, playComboSound, initialize } = useSoundSettings();

	const pieceOverlapsRectangle = (layout: Rectangle, other: Rectangle) => {
		"worklet";
		if (other.width == 0 && other.height == 0) {
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
	}, []);

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
			const piece: PieceData = hand.value[draggingPiece.value!]!;

			// the block is gonna fit, let's place the block
			// we'll do the haptics now
			if (Platform.OS != 'web') {
				runPiecePlacedHaptic();
			} else {
				if (typeof navigator !== 'undefined' && navigator.vibrate) {
					navigator.vibrate(15);
				}
			}
			
			// Звук размещения блока
			runOnJS(playSfx)('placeBlock');

			const newBoard = clearHoverBlocks([...board.value]);
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
				
				if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.vibrate) {
					navigator.vibrate([25, 45, 25]);
				}
				
				// line break score + combo multiplier stuff
				pointsEarned += linesBroken * boardLength * (combo.value / 2) * pieceBlockCount;
				score.value += pointsEarned;
			} else {
				score.value += pointsEarned;
				lastBrokenLine.value++;
				if (lastBrokenLine.value >= handSize) {
					combo.value = 0;
				}
			}
			
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
				nextHand = createRandomHandWorklet(handSize);
			} else {
				nextHand = newHand;
			}
			hand.value = nextHand;
			
			board.value = newBoard;

			// Сохраняем состояние текущей игры
			runOnJS(saveActiveGame)({
				gameMode,
				board: newBoard,
				hand: nextHand,
				score: score.value,
				combo: combo.value,
				lastBrokenLine: lastBrokenLine.value,
				scoreStorageId: scoreStorageId.value
			});
			
			// Проверка игры на окончание после обновления руки
			runOnJS(setTimeout)(() => {
				// Исправлено: правильное использование runOnJS и проверка результата
				const hasPossibleMoves = checkForPossibleMoves();
				if (!hasPossibleMoves) {
					setIsGameOver(true);
					clearActiveGame(); // Очищаем сохраненную игру, так как она окончена
				}
			}, 300);
			
		} else {
			board.value = clearHoverBlocks([...board.value]);
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
		const {x: dropX, y: dropY} = decodeDndId(dropIdStr);
		const piece: PieceData = hand.value[draggingPiece.value!]!;

		const newBoard = clearHoverBlocks([...board.value]);
		updateHoveredBreaks(newBoard, piece, dropX, dropY);

		board.value = newBoard;
	};
	
	return (        
		<SafeAreaView style={[styles.root, { backgroundColor: currentTheme.background }]}>
			<GestureHandlerRootView style={styles.root}>
				<View style={styles.root}>
					<StickyGameHud gameMode={gameMode} score={score}></StickyGameHud>
					<DndProvider shouldDropWorklet={pieceOverlapsRectangle} springConfig={SPRING_CONFIG_MISSED_DRAG} onBegin={handleBegin} onFinalize={handleFinalize} onDragEnd={handleDragEnd} onUpdate={handleUpdate}>
						<StatsGameHud score={score} combo={combo} lastBrokenLine={lastBrokenLine} hand={hand}></StatsGameHud>
						<BlockGrid board={board} possibleBoardDropSpots={possibleBoardDropSpots} hand={hand} draggingPiece={draggingPiece}></BlockGrid>
						<View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
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
						<HandPieces hand={hand} boardSize={boardLength}></HandPieces>
					</DndProvider>
					
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
	}
});

export default Game;