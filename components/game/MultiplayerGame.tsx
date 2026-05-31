import { PieceData, getBlockCount } from '@/constants/Piece';
import { DndProvider, DndProviderProps, Rectangle } from '@mgcrea/react-native-dnd';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, SafeAreaView, StyleSheet, Text, View, useWindowDimensions, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import Animated, { ReduceMotion, runOnJS, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, useAnimatedReaction } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Board, BoardBlockType, JS_emptyPossibleBoardSpots, PossibleBoardSpots, XYPoint, breakLines, clearHoverBlocks, createPossibleBoardSpots, emptyPossibleBoardSpots, newEmptyBoard, placePieceOntoBoard, updateHoveredBreaks, useGameSizes } from '@/constants/Board';
import { StatsGameHud, StickyGameHud } from '@/components/game/GameHud';
import BlockGrid, { ReadOnlyBlockGrid } from '@/components/game/BlockGrid';
import { Hand, createRandomHand, createRandomHandWorklet } from '@/constants/Hand';
import HandPieces, { ReadOnlyHandPieces } from '@/components/game/HandPieces';
import { GameModeType, MenuStateType, useAppState, activeComboAtom } from '@/hooks/useAppState';
import { supabase, submitGlobalHighScore } from '@/constants/Supabase';
import { useTheme } from '@/constants/Theme';
import StylizedButton from '../StylizedButton';
import { cssColors } from '@/constants/Color';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScorePopup } from './ScorePopup';
import { useSoundSettings } from '@/constants/Sound';
import { useAtom } from 'jotai';

interface MultiplayerGameProps {
    roomId: string;
    myRole: 'player1' | 'player2';
    opponentName: string;
    gameMode: GameModeType;
}

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

export default function MultiplayerGame({ roomId, myRole, opponentName, gameMode }: MultiplayerGameProps) {
    const { width, height } = useWindowDimensions();
    const isLargeScreen = width >= 768;
    const isShortScreen = height < 700;
    const boardLength = gameMode == GameModeType.Chaos ? 10 : 8;
	
    // Game sizes
	const { GRID_BLOCK_SIZE, DRAG_JUMP_LENGTH } = useGameSizes(boardLength);
    const handSize = gameMode == GameModeType.Chaos ? 5 : 3;
	
    // Local player states
	const board = useSharedValue(newEmptyBoard(boardLength));
	const draggingPiece = useSharedValue<number | null>(null);
	const possibleBoardDropSpots = useSharedValue<PossibleBoardSpots>(JS_emptyPossibleBoardSpots(boardLength));
	const hand = useSharedValue(createRandomHand(handSize));
	const score = useSharedValue(0);
	const combo = useSharedValue(0);
	const lastBrokenLine = useSharedValue(0);
	const [isGameOver, setIsGameOver] = useState(false);
    const [isSpectating, setIsSpectating] = useState(false);
    
    // Opponent states
    const [opponentBoard, setOpponentBoard] = useState<Board>(newEmptyBoard(boardLength));
    const [opponentHand, setOpponentHand] = useState<Hand>([]);
    const [opponentHover, setOpponentHover] = useState<{ index: number | null, x: number | null, y: number | null }>({ index: null, x: null, y: null });
    const [opponentScore, setOpponentScore] = useState(0);
    const [opponentIsGameOver, setOpponentIsGameOver] = useState(false);
    const [opponentDisconnected, setOpponentDisconnected] = useState(false);

    // End game variables
    const [setAppState] = useAppState()[1] ? [useAppState()[1]] : [() => {}];
    const { currentTheme } = useTheme();
    const channelRef = useRef<any>(null);
    const lastSentHover = useRef<{ index: number | null, x: number | null, y: number | null }>({ index: null, x: null, y: null });
    const hoverThrottleTimer = useRef<any>(null);
    const pendingHover = useRef<{ index: number | null, x: number | null, y: number | null } | null>(null);
    const [playerName, setPlayerName] = useState("Anonymous");
    const [scorePopups, setScorePopups] = useState<{id: number, points: number, x: number, y: number}[]>([]);
    const scorePopupIdCounter = useRef(0);

    const { playSfx, playComboSound, initialize } = useSoundSettings();
    const [activeCombo, setActiveCombo] = useAtom(activeComboAtom);

    useAnimatedReaction(() => {
        return combo.value;
    }, (curCombo) => {
        runOnJS(setActiveCombo)(curCombo);
    });

    const addScorePopup = (points: number, x: number, y: number) => {
        const id = scorePopupIdCounter.current++;
        setScorePopups(prev => [...prev, { id, points, x, y }]);
    };

    const removeScorePopup = (id: number) => {
        setScorePopups(prev => prev.filter(p => p.id !== id));
    };

    // Setup networking and sounds
    useEffect(() => {
        initialize();

        AsyncStorage.getItem('PLAYER_NAME').then((val) => {
            if (val) {
                setPlayerName(val);
            }
        });

        const channel = supabase.channel(`room:${roomId}`);
        
        channel
            .on('broadcast', { event: 'game_state' }, (payload) => {
                const data = payload.payload;
                if (data.board) setOpponentBoard(data.board);
                if (data.hand) setOpponentHand(data.hand);
                if (typeof data.score === 'number') setOpponentScore(data.score);
                if (typeof data.isGameOver === 'boolean') setOpponentIsGameOver(data.isGameOver);
            })
            .on('broadcast', { event: 'hover_state' }, (payload) => {
                const data = payload.payload;
                setOpponentHover(data);
            })
            .on('presence', { event: 'leave' }, () => {
                setOpponentDisconnected(true);
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    // Send initial state
                    broadcastState(board.value, hand.value, score.value, combo.value, lastBrokenLine.value, false);
                }
            });

        channelRef.current = channel;

        return () => {
            setActiveCombo(0);
            if (hoverThrottleTimer.current) {
                clearInterval(hoverThrottleTimer.current);
            }
            supabase.removeChannel(channel);
            // End room in database when either player exits
            supabase.from('matchmaking_rooms').update({ status: 'finished' }).eq('id', roomId).then();
        };
    }, []);

    const broadcastState = (
        currentBoard: Board, 
        currentHand: any, 
        currentScore: number, 
        currentCombo: number, 
        currentLastBrokenLine: number,
        currentIsGameOver: boolean
    ) => {
        if (channelRef.current) {
            channelRef.current.send({
                type: 'broadcast',
                event: 'game_state',
                payload: {
                    board: currentBoard,
                    hand: currentHand,
                    score: currentScore,
                    isGameOver: currentIsGameOver
                }
            });
        }
    };

    const broadcastHoverState = (index: number | null, x: number | null, y: number | null) => {
        if (
            lastSentHover.current.index === index &&
            lastSentHover.current.x === x &&
            lastSentHover.current.y === y
        ) {
            return;
        }
        
        pendingHover.current = { index, x, y };

        if (!hoverThrottleTimer.current) {
            // Send immediately
            sendPendingHover();
            // Start throttle period
            hoverThrottleTimer.current = setInterval(() => {
                if (pendingHover.current) {
                    sendPendingHover();
                } else {
                    // Clear interval if no updates are pending
                    clearInterval(hoverThrottleTimer.current);
                    hoverThrottleTimer.current = null;
                }
            }, 80);
        }
    };

    const sendPendingHover = () => {
        if (!pendingHover.current) return;
        const { index, x, y } = pendingHover.current;
        pendingHover.current = null;
        lastSentHover.current = { index, x, y };

        if (channelRef.current) {
            channelRef.current.send({
                type: 'broadcast',
                event: 'hover_state',
                payload: { index, x, y }
            });
        }
    };

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

	const checkForPossibleMoves = () => {
		for (let i = 0; i < hand.value.length; i++) {
			const piece = hand.value[i];
			if (!piece) continue;
			
			const possibleSpots = createPossibleBoardSpots(board.value, piece);
			for (let y = 0; y < possibleSpots.length; y++) {
				for (let x = 0; x < possibleSpots[y].length; x++) {
					if (possibleSpots[y][x] === 1) {
						return true;
					}
				}
			}
		}
		return false;
	};

    const handleGameOver = () => {
        setIsGameOver(true);
        broadcastState(board.value, hand.value, score.value, combo.value, lastBrokenLine.value, true);
        
        // Write winner to database if both finished
        checkAndSaveWinner(score.value, opponentScore, true, opponentIsGameOver);

        // Submit high score to database
        submitGlobalHighScore(playerName, score.value, gameMode);
        
        runOnJS(playSfx)('gameOver');
    };

    const checkAndSaveWinner = async (myScore: number, oppScore: number, myOver: boolean, oppOver: boolean) => {
        if (myOver && oppOver) {
            let winner = 'Draw';
            if (myScore > oppScore) winner = myRole === 'player1' ? 'player1' : 'player2';
            else if (oppScore > myScore) winner = myRole === 'player1' ? 'player2' : 'player1';

            const winnerName = winner === 'player1' ? 'Player 1' : winner === 'player2' ? 'Player 2' : 'Draw';
            
            await supabase
                .from('matchmaking_rooms')
                .update({
                    status: 'finished',
                    winner_name: winnerName
                })
                .eq('id', roomId);
        }
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

			if (Platform.OS != 'web') {
				runPiecePlacedHaptic();
			} else {
				if (typeof navigator !== 'undefined' && navigator.vibrate) {
					navigator.vibrate(15);
				}
			}

			// Play placement sound
			runOnJS(playSfx)('placeBlock');

			const newBoard = clearHoverBlocks([...board.value]);
			placePieceOntoBoard(newBoard, piece, dropX, dropY, BoardBlockType.FILLED);
			const linesBroken = breakLines(newBoard);
			
			const pieceBlockCount = getBlockCount(piece);
			let pointsEarned = pieceBlockCount;
			
			if (linesBroken > 0) {
				lastBrokenLine.value = 0;
				combo.value += linesBroken;
				
				// Play combo line break sound
				runOnJS(playComboSound)(combo.value);

				if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.vibrate) {
					navigator.vibrate([25, 45, 25]);
				}
				
				pointsEarned += linesBroken * boardLength * (combo.value / 2) * pieceBlockCount;
				score.value += pointsEarned;
			} else {
				score.value += pointsEarned;
				lastBrokenLine.value++;
				if (lastBrokenLine.value >= handSize) {
					combo.value = 0;
				}
			}
			
			const newHand = [...hand.value];
			newHand[draggingPiece.value!] = null;

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

            // Broadcast changes to opponent
            runOnJS(broadcastState)(newBoard, nextHand, score.value, combo.value, lastBrokenLine.value, false);
			runOnJS(addScorePopup)(pointsEarned, dropX * GRID_BLOCK_SIZE, dropY * GRID_BLOCK_SIZE);
			
			runOnJS(setTimeout)(() => {
				const hasPossibleMoves = checkForPossibleMoves();
				if (!hasPossibleMoves) {
                    runOnJS(handleGameOver)();
				}
			}, 300);
			
		} else {
			board.value = clearHoverBlocks([...board.value]);
			// Play invalid drop sound
			runOnJS(playSfx)('invalidPlacement');
		}
		
		draggingPiece.value = null;
		possibleBoardDropSpots.value = emptyPossibleBoardSpots(boardLength);
		runOnJS(broadcastHoverState)(null, null, null);
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
			runOnJS(broadcastHoverState)(null, null, null);
		}
	};

	const handleUpdate: DndProviderProps["onUpdate"] = (event, {activeId, activeLayout, droppableActiveId}) => {
		"worklet";
		if (!droppableActiveId) {
			board.value = clearHoverBlocks([...board.value]);
			runOnJS(broadcastHoverState)(draggingPiece.value, null, null);
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

		runOnJS(broadcastHoverState)(draggingPiece.value, dropX, dropY);
	};

    const handleExit = () => {
        setAppState(MenuStateType.MENU);
    };

    const showWinnerOverlay = (isGameOver && opponentIsGameOver) || opponentDisconnected;
    
    let winnerMessage = "";
    if (opponentDisconnected) {
        winnerMessage = "Opponent disconnected. You Win!";
    } else if (isGameOver && opponentIsGameOver) {
        if (score.value > opponentScore) {
            winnerMessage = "Victory! You won!";
        } else if (opponentScore > score.value) {
            winnerMessage = "Defeat! Opponent won.";
        } else {
            winnerMessage = "It's a Draw!";
        }
    }

	return (        
		<SafeAreaView style={[styles.root, { backgroundColor: currentTheme.background }]}>
			<GestureHandlerRootView style={styles.root}>
                <StickyGameHud gameMode={gameMode} score={score}></StickyGameHud>
				
				{isSpectating ? (
					<View style={styles.spectatorContainer}>
                        <View style={styles.liveContainer}>
                            <LiveDot />
                            <Text style={[styles.spectatorTitle, { color: currentTheme.accent }]}>
                                Watching {opponentName}
                            </Text>
                        </View>
						<Text style={[styles.spectatorScore, { color: currentTheme.textPrimary }]}>
							Score: {opponentScore}
						</Text>
						
						<View style={{ marginVertical: 10 }}>
							<ReadOnlyBlockGrid 
								board={opponentBoard} 
								gridBlockSize={GRID_BLOCK_SIZE} 
								hoverIndex={opponentHover.index}
								hoverX={opponentHover.x}
								hoverY={opponentHover.y}
								hand={opponentHand}
							/>
						</View>

						<View style={{ marginTop: 10, alignItems: 'center' }}>
							<Text style={{ fontFamily: 'Silkscreen', color: currentTheme.textSecondary, fontSize: 14, marginBottom: 5 }}>
								Opponent's Hand:
							</Text>
							<ReadOnlyHandPieces hand={opponentHand} boardSize={boardLength} />
						</View>

						<View style={{ marginTop: 20 }}>
							<StylizedButton text="Exit to Lobby" onClick={handleExit} backgroundColor={cssColors.spaceGray} />
						</View>
					</View>
				) : (
					<View style={isLargeScreen ? styles.sideBySideContainer : styles.stackedContainer}>
						
						{/* On mobile, render opponent's board at the top */}
						{!isLargeScreen && (
							<View style={[styles.opponentMiniRow, isShortScreen && { padding: 4, marginTop: 5, gap: 5 }]}>
								<View style={[styles.opponentHeader, isShortScreen && { marginBottom: 0 }]}>
									<Text style={[styles.opponentNameText, { color: currentTheme.textSecondary }, isShortScreen && { fontSize: 13 }]}>
										{opponentName} {opponentIsGameOver && "(GameOver)"}
									</Text>
									<Text style={[styles.opponentScoreText, { color: currentTheme.accent }, isShortScreen && { fontSize: 15 }]}>
										Score: {opponentScore}
									</Text>
								</View>

								<View style={styles.miniGridScale}>
									<ReadOnlyBlockGrid 
										board={opponentBoard} 
										gridBlockSize={isShortScreen ? 11 : 14} 
										hoverIndex={opponentHover.index}
										hoverX={opponentHover.x}
										hoverY={opponentHover.y}
										hand={opponentHand}
									/>
								</View>

								<View style={{ alignItems: 'center', marginLeft: isShortScreen ? 4 : 10 }}>
									<ReadOnlyHandPieces hand={opponentHand} boardSize={boardLength} scale={isShortScreen ? 0.4 : 0.5} />
								</View>
							</View>
						)}

						{/* Local Player's board */}
						<View style={styles.gameColumn}>
							{isLargeScreen && <Text style={[styles.playerNameText, { color: currentTheme.textPrimary }]}>You</Text>}
							<DndProvider shouldDropWorklet={pieceOverlapsRectangle} springConfig={SPRING_CONFIG_MISSED_DRAG} onBegin={handleBegin} onFinalize={handleFinalize} onDragEnd={handleDragEnd} onUpdate={handleUpdate}>
								<StatsGameHud score={score} combo={combo} lastBrokenLine={lastBrokenLine} hand={hand}></StatsGameHud>
								<BlockGrid board={board} possibleBoardDropSpots={possibleBoardDropSpots} hand={hand} draggingPiece={draggingPiece}></BlockGrid>
								<View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
									{scorePopups.map(popup => (
										<ScorePopup 
											key={popup.id} 
											points={popup.points} 
											x={popup.x + 30} 
											y={popup.y + 100} 
											onComplete={() => removeScorePopup(popup.id)} 
										/>
									))}
								</View>
								<HandPieces hand={hand} boardSize={boardLength}></HandPieces>
							</DndProvider>
						</View>

						{/* On desktop, render opponent's board on the right */}
						{isLargeScreen && (
							<View style={styles.opponentColumn}>
								<View style={styles.opponentHeader}>
									<Text style={[styles.opponentNameText, { color: currentTheme.textSecondary }]}>
										{opponentName} {opponentIsGameOver && "(GameOver)"}
									</Text>
									<Text style={[styles.opponentScoreText, { color: currentTheme.accent }]}>
										Score: {opponentScore}
									</Text>
								</View>

								<View>
									<ReadOnlyBlockGrid 
										board={opponentBoard} 
										gridBlockSize={GRID_BLOCK_SIZE} 
										hoverIndex={opponentHover.index}
										hoverX={opponentHover.x}
										hoverY={opponentHover.y}
										hand={opponentHand}
									/>
								</View>

								<View style={{ marginTop: 20, alignItems: 'center' }}>
									<Text style={{ fontFamily: 'Silkscreen', color: currentTheme.textSecondary, fontSize: 14, marginBottom: 5 }}>Opponent's Hand:</Text>
									<ReadOnlyHandPieces hand={opponentHand} boardSize={boardLength} />
								</View>
							</View>
						)}

					</View>
				)}

                {/* Winner Overlay Modal */}
                {showWinnerOverlay && (
                    <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.85)' }]}>
                        <View style={[styles.modalBox, { backgroundColor: currentTheme.menuBackground }]}>
                            <Text style={[styles.modalTitle, { color: currentTheme.buttonPrimary }]}>Game Over</Text>
                            <Text style={[styles.modalMessage, { color: currentTheme.textPrimary }]}>{winnerMessage}</Text>
                            
                            <View style={styles.scoresComparison}>
                                <Text style={[styles.finalScoreText, { color: currentTheme.textSecondary }]}>
                                    Your Score: <Text style={{ color: currentTheme.textPrimary }}>{score.value}</Text>
                                </Text>
                                <Text style={[styles.finalScoreText, { color: currentTheme.textSecondary }]}>
                                    {opponentName}'s Score: <Text style={{ color: currentTheme.textPrimary }}>{opponentScore}</Text>
                                </Text>
                            </View>

                            <StylizedButton 
                                text="Multiplayer Lobby" 
                                onClick={handleExit} 
                                backgroundColor={currentTheme.buttonPrimary} 
                            />
                        </View>
                    </View>
                )}

                {/* Waiting for opponent to finish */}
                {isGameOver && !opponentIsGameOver && !opponentDisconnected && !isSpectating && (
                    <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
                        <View style={[styles.modalBox, { backgroundColor: currentTheme.menuBackground }]}>
                            <Text style={[styles.modalTitle, { color: currentTheme.accent }]}>Game Over</Text>
                            <Text style={[styles.modalMessage, { color: currentTheme.textPrimary }]}>Waiting for opponent to finish...</Text>
                            <Text style={[styles.finalScoreText, { color: currentTheme.textSecondary }]}>Your Score: {score.value}</Text>
                            <Text style={[styles.finalScoreText, { color: currentTheme.textSecondary }]}>{opponentName}'s Score: {opponentScore}</Text>
                            <ActivityIndicator size="large" color={currentTheme.accent} style={{ marginVertical: 15 }} />
                            
                            <StylizedButton 
                                text="Watch Opponent" 
                                onClick={() => setIsSpectating(true)} 
                                backgroundColor={currentTheme.buttonPrimary} 
                                style={{ marginBottom: 5 }}
                            />
                            
                            <StylizedButton text="Exit to Lobby" onClick={handleExit} backgroundColor={cssColors.spaceGray} />
                        </View>
                    </View>
                )}

			</GestureHandlerRootView>
		</SafeAreaView>
	);
}

const LiveDot = () => {
    const pulse = useSharedValue(0.5);
    useEffect(() => {
        pulse.value = withRepeat(
            withSequence(
                withTiming(1.0, { duration: 600 }),
                withTiming(0.4, { duration: 600 })
            ),
            -1,
            true
        );
    }, []);
    const animatedStyle = useAnimatedStyle(() => ({
        opacity: pulse.value
    }));
    return (
        <Animated.View style={[styles.liveDot, animatedStyle]} />
    );
};

const styles = StyleSheet.create({
	root: {
		width: '100%',
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 0,
		overflow: 'hidden',
	},
    sideBySideContainer: {
        flexDirection: 'row',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
        gap: 50
    },
    stackedContainer: {
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 5
    },
    gameColumn: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    opponentColumn: {
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0.8
    },
    opponentMiniRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        width: '95%',
        padding: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#333',
        marginTop: 10,
        marginBottom: 5,
        gap: 12
    },
    miniGridScale: {
        transform: [{ scale: 1.0 }]
    },
    opponentHeader: {
        alignItems: 'center',
        marginBottom: 10
    },
    playerNameText: {
        fontSize: 22,
        fontFamily: 'Silkscreen',
        marginBottom: 5
    },
    opponentNameText: {
        fontSize: 16,
        fontFamily: 'Silkscreen',
    },
    opponentScoreText: {
        fontSize: 18,
        fontFamily: 'Silkscreen',
        fontWeight: 'bold'
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
    },
    modalBox: {
        width: '80%',
        maxWidth: 400,
        borderRadius: 12,
        borderWidth: 3,
        borderColor: '#555',
        padding: 25,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 15
    },
    modalTitle: {
        fontSize: 32,
        fontFamily: 'Silkscreen',
        textShadowColor: 'rgba(0, 0, 0, 0.75)',
        textShadowOffset: { width: 2, height: 2 },
        textShadowRadius: 3
    },
    modalMessage: {
        fontSize: 18,
        fontFamily: 'Silkscreen',
        textAlign: 'center',
        lineHeight: 24
    },
    scoresComparison: {
        marginVertical: 10,
        alignItems: 'center',
        gap: 5
    },
    finalScoreText: {
        fontSize: 16,
        fontFamily: 'Silkscreen',
    },
    spectatorContainer: {
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 5
    },
    spectatorTitle: {
        fontSize: 24,
        fontFamily: 'Silkscreen',
        textAlign: 'center'
    },
    spectatorScore: {
        fontSize: 20,
        fontFamily: 'Silkscreen',
        marginBottom: 15,
        fontWeight: 'bold',
        textAlign: 'center'
    },
    liveDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: 'red',
        marginRight: 8
    },
    liveContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 5
    }
});
