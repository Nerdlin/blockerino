import { PieceData, getBlockCount, getRandomPieceWorklet } from '@/constants/Piece';
import { DndProvider, DndProviderProps, Rectangle } from '@mgcrea/react-native-dnd';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, SafeAreaView, StyleSheet, Text, View, useWindowDimensions, ActivityIndicator, ScrollView } from 'react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import Animated, { ReduceMotion, runOnJS, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, useAnimatedReaction } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Board, BoardBlockType, JS_emptyPossibleBoardSpots, PossibleBoardSpots, XYPoint, breakLines, clearHoverBlocks, createPossibleBoardSpots, emptyPossibleBoardSpots, newEmptyBoard, placePieceOntoBoard, updateHoveredBreaks, useGameSizes } from '@/constants/Board';
import { StatsGameHud, StickyGameHud } from '@/components/game/GameHud';
import BlockGrid, { ReadOnlyBlockGrid } from '@/components/game/BlockGrid';
import { Hand, createRandomHand, createRandomHandWorklet } from '@/constants/Hand';
import HandPieces, { ReadOnlyHandPieces } from '@/components/game/HandPieces';
import { GameModeType, MenuStateType, useAppState, activeComboAtom } from '@/hooks/useAppState';
import { supabase, submitGlobalHighScore, submitEloRating } from '@/constants/Supabase';
import { useTheme } from '@/constants/Theme';
import StylizedButton from '../StylizedButton';
import { cssColors } from '@/constants/Color';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScorePopup } from './ScorePopup';
import { useSoundSettings } from '@/constants/Sound';
import { useAtom } from 'jotai';
import { getEloBadge } from '@/components/MultiplayerMenu';

interface MultiplayerGameProps {
    roomId: string;
    myRole: 'player1' | 'player2' | 'spectator';
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

function FloatingEmote({ text, onComplete }: { text: string; onComplete: () => void }) {
    const translateY = useSharedValue(0);
    const opacity = useSharedValue(1);

    useEffect(() => {
        translateY.value = withTiming(-60, { duration: 1500 });
        opacity.value = withTiming(0, { duration: 1500 }, (finished) => {
            if (finished) {
                runOnJS(onComplete)();
            }
        });
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
        opacity: opacity.value,
    }));

    return (
        <Animated.View style={[styles.emoteBubble, animatedStyle]}>
            <Text style={styles.emoteText}>{text}</Text>
        </Animated.View>
    );
}

const addGarbageLines = (currentBoard: Board, lines: number): Board => {
    const boardLength = currentBoard.length;
    const nextBoard = currentBoard.map(row => row.map(cell => ({ ...cell })));
    
    // Shift rows up by lines
    for (let y = 0; y < boardLength - lines; y++) {
        nextBoard[y] = nextBoard[y + lines];
    }
    
    // Insert new garbage rows at the bottom
    for (let y = boardLength - lines; y < boardLength; y++) {
        const randomHoleX = Math.floor(Math.random() * boardLength);
        const garbageRow = [];
        for (let x = 0; x < boardLength; x++) {
            if (x === randomHoleX) {
                garbageRow.push({
                    blockType: BoardBlockType.EMPTY,
                    color: { r: 0, g: 0, b: 0 },
                    hoveredBreakColor: { r: 0, g: 0, b: 0 },
                    isBomb: false,
                });
            } else {
                garbageRow.push({
                    blockType: BoardBlockType.FILLED,
                    color: { r: 100, g: 100, b: 100 }, // Gray color
                    hoveredBreakColor: { r: 0, g: 0, b: 0 },
                    isBomb: false,
                });
            }
        }
        nextBoard[y] = garbageRow;
    }
    
    return nextBoard;
};

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
	const hand = useSharedValue(createRandomHand(handSize, gameMode));
	const score = useSharedValue(0);
	const combo = useSharedValue(0);
	const lastBrokenLine = useSharedValue(0);

	const [isGameOver, setIsGameOver] = useState(false);
    const [isSpectating, setIsSpectating] = useState(myRole === 'spectator');
    
    // ELO states
    const [playerElo, setPlayerElo] = useState<number>(1000);
    const [opponentElo, setOpponentElo] = useState<number | null>(null);

    // Opponent states
    const [opponentBoard, setOpponentBoard] = useState<Board>(newEmptyBoard(boardLength));
    const [opponentHand, setOpponentHand] = useState<Hand>([]);
    const [opponentHover, setOpponentHover] = useState<{ index: number | null, x: number | null, y: number | null }>({ index: null, x: null, y: null });
    const [opponentScore, setOpponentScore] = useState(0);
    const [opponentIsGameOver, setOpponentIsGameOver] = useState(false);
    const [opponentDisconnected, setOpponentDisconnected] = useState(false);

    // Spectator state tracking
    const [player1Board, setPlayer1Board] = useState<Board>(newEmptyBoard(boardLength));
    const [player1Hand, setPlayer1Hand] = useState<Hand>([]);
    const [player1Score, setPlayer1Score] = useState(0);
    const [player1IsGameOver, setPlayer1IsGameOver] = useState(false);
    const [player1Elo, setPlayer1Elo] = useState<number | null>(null);
    const [player1Name, setPlayer1Name] = useState('Player 1');
    const [player1Hover, setPlayer1Hover] = useState<{ index: number | null, x: number | null, y: number | null }>({ index: null, x: null, y: null });

    const [player2Board, setPlayer2Board] = useState<Board>(newEmptyBoard(boardLength));
    const [player2Hand, setPlayer2Hand] = useState<Hand>([]);
    const [player2Score, setPlayer2Score] = useState(0);
    const [player2IsGameOver, setPlayer2IsGameOver] = useState(false);
    const [player2Elo, setPlayer2Elo] = useState<number | null>(null);
    const [player2Name, setPlayer2Name] = useState('Player 2');
    const [player2Hover, setPlayer2Hover] = useState<{ index: number | null, x: number | null, y: number | null }>({ index: null, x: null, y: null });

    // Emotes overlay tracking
    const [p1Emotes, setP1Emotes] = useState<{ id: number; text: string }[]>([]);
    const [p2Emotes, setP2Emotes] = useState<{ id: number; text: string }[]>([]);
    const emoteCounter = useRef(0);

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

    const addScorePopup = (points: number, x: number, y: number) => {
        const id = scorePopupIdCounter.current++;
        setScorePopups(prev => [...prev, { id, points, x, y }]);
    };

    const removeScorePopup = (id: number) => {
        setScorePopups(prev => prev.filter(p => p.id !== id));
    };

    const { playSfx, playComboSound } = useSoundSettings();
    const [, setActiveCombo] = useAtom(activeComboAtom);
    const updateActiveCombo = (val: number) => {
        setActiveCombo(val);
    };

    const sendGarbageAttack = (lines: number) => {
        if (myRole === 'spectator') return;
        if (channelRef.current) {
            channelRef.current.send({
                type: 'broadcast',
                event: 'garbage_attack',
                payload: { lines, role: myRole }
            });
        }
    };

    const sendEmote = (text: string) => {
        if (myRole === 'spectator') return;
        if (channelRef.current) {
            channelRef.current.send({
                type: 'broadcast',
                event: 'live_emote',
                payload: { text, role: myRole }
            });
        }
        const id = emoteCounter.current++;
        if (myRole === 'player1') {
            setP1Emotes(prev => [...prev, { id, text }]);
        } else if (myRole === 'player2') {
            setP2Emotes(prev => [...prev, { id, text }]);
        }
    };

    // Setup networking
    useEffect(() => {
        setActiveCombo(0);

        Promise.all([
            AsyncStorage.getItem('PLAYER_NAME'),
            AsyncStorage.getItem('PLAYER_ELO')
        ]).then(([nameVal, eloVal]) => {
            const loadedName = nameVal || 'Anonymous';
            const loadedElo = parseInt(eloVal || '1000', 10);
            
            if (nameVal) setPlayerName(nameVal);
            setPlayerElo(loadedElo);

            const channel = supabase.channel(`room:${roomId}`);
            
            channel
                .on('broadcast', { event: 'game_state' }, (payload) => {
                    const data = payload.payload;
                    if (myRole === 'spectator' || isSpectating) {
                        if (data.role === 'player1') {
                            if (data.board) setPlayer1Board(data.board);
                            if (data.hand) setPlayer1Hand(data.hand);
                            if (typeof data.score === 'number') setPlayer1Score(data.score);
                            if (typeof data.isGameOver === 'boolean') setPlayer1IsGameOver(data.isGameOver);
                            if (typeof data.elo === 'number') setPlayer1Elo(data.elo);
                            if (data.playerName) setPlayer1Name(data.playerName);
                        } else if (data.role === 'player2') {
                            if (data.board) setPlayer2Board(data.board);
                            if (data.hand) setPlayer2Hand(data.hand);
                            if (typeof data.score === 'number') setPlayer2Score(data.score);
                            if (typeof data.isGameOver === 'boolean') setPlayer2IsGameOver(data.isGameOver);
                            if (typeof data.elo === 'number') setPlayer2Elo(data.elo);
                            if (data.playerName) setPlayer2Name(data.playerName);
                        }
                    } else {
                        if (data.board) setOpponentBoard(data.board);
                        if (data.hand) setOpponentHand(data.hand);
                        if (typeof data.score === 'number') setOpponentScore(data.score);
                        if (typeof data.isGameOver === 'boolean') setOpponentIsGameOver(data.isGameOver);
                        if (typeof data.elo === 'number') setOpponentElo(data.elo);
                    }
                })
                .on('broadcast', { event: 'hover_state' }, (payload) => {
                    const data = payload.payload;
                    if (myRole === 'spectator' || isSpectating) {
                        if (data.role === 'player1') {
                            setPlayer1Hover({ index: data.index, x: data.x, y: data.y });
                        } else if (data.role === 'player2') {
                            setPlayer2Hover({ index: data.index, x: data.x, y: data.y });
                        }
                    } else {
                        setOpponentHover(data);
                    }
                })
                .on('broadcast', { event: 'live_emote' }, (payload) => {
                    const data = payload.payload;
                    const id = emoteCounter.current++;
                    if (data.role === 'player1') {
                        setP1Emotes(prev => [...prev, { id, text: data.text }]);
                    } else if (data.role === 'player2') {
                        setP2Emotes(prev => [...prev, { id, text: data.text }]);
                    }
                })
                .on('broadcast', { event: 'garbage_attack' }, (payload) => {
                    const data = payload.payload;
                    // apply garbage attack if we are an active player
                    if (myRole !== 'spectator' && !isGameOver) {
                        const nextBoard = addGarbageLines(board.value, data.lines);
                        board.value = nextBoard;

                        if (Platform.OS === 'web') {
                            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                                navigator.vibrate([100, 50, 100]);
                            }
                        } else {
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                        }

                        playSfx('invalidPlacement');

                        broadcastState(nextBoard, hand.value, score.value, combo.value, lastBrokenLine.value, false);

                        setTimeout(() => {
                            const hasPossibleMoves = checkForPossibleMoves();
                            if (!hasPossibleMoves) {
                                handleGameOver();
                            }
                        }, 300);
                    }
                })
                .on('presence', { event: 'leave' }, () => {
                    setOpponentDisconnected(true);
                })
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        if (myRole !== 'spectator') {
                            if (channelRef.current) {
                                channelRef.current.send({
                                    type: 'broadcast',
                                    event: 'game_state',
                                    payload: {
                                        board: board.value,
                                        hand: hand.value,
                                        score: score.value,
                                        isGameOver: false,
                                        elo: loadedElo,
                                        playerName: loadedName,
                                        role: myRole
                                    }
                                });
                            }
                        }
                    }
                });

            channelRef.current = channel;
        });

        return () => {
            setActiveCombo(0);
            if (hoverThrottleTimer.current) {
                clearInterval(hoverThrottleTimer.current);
            }
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
            }
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
        if (channelRef.current && myRole !== 'spectator') {
            channelRef.current.send({
                type: 'broadcast',
                event: 'game_state',
                payload: {
                    board: currentBoard,
                    hand: currentHand,
                    score: currentScore,
                    isGameOver: currentIsGameOver,
                    elo: playerElo,
                    playerName: playerName,
                    role: myRole
                }
            });
        }
    };

    const broadcastHoverState = (index: number | null, x: number | null, y: number | null) => {
        if (myRole === 'spectator') return;
        if (
            lastSentHover.current.index === index &&
            lastSentHover.current.x === x &&
            lastSentHover.current.y === y
        ) {
            return;
        }
        
        pendingHover.current = { index, x, y };

        if (!hoverThrottleTimer.current) {
            hoverThrottleTimer.current = setInterval(() => {
                if (pendingHover.current && channelRef.current) {
                    channelRef.current.send({
                        type: 'broadcast',
                        event: 'hover_state',
                        payload: {
                            ...pendingHover.current,
                            role: myRole
                        }
                    });
                    lastSentHover.current = pendingHover.current;
                    pendingHover.current = null;
                }
            }, 100); // 100ms throttle
        }
    };

    const eloUpdatedRef = useRef(false);

    useEffect(() => {
        if (myRole === 'spectator') return;
        if (eloUpdatedRef.current) return;

        const isGameComplete = (isGameOver && opponentIsGameOver) || opponentDisconnected;
        if (isGameComplete) {
            eloUpdatedRef.current = true;

            AsyncStorage.getItem('PLAYER_ELO').then((val) => {
                const currentElo = parseInt(val || '1000', 10);
                let eloDiff = 0;

                if (opponentDisconnected) {
                    // Win by opponent disconnection
                    eloDiff = 25;
                } else if (isGameOver && opponentIsGameOver) {
                    if (score.value > opponentScore) {
                        eloDiff = 25;
                    } else if (opponentScore > score.value) {
                        eloDiff = -25;
                    } else {
                        eloDiff = 0;
                    }
                }

                const newElo = Math.max(500, currentElo + eloDiff);
                AsyncStorage.setItem('PLAYER_ELO', newElo.toString());
                setPlayerElo(newElo);
                submitEloRating(playerName, newElo);
            });
        }
    }, [isGameOver, opponentIsGameOver, opponentDisconnected]);

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
			if (isNaN(dropX) || isNaN(dropY)) {
				draggingPiece.value = null;
				possibleBoardDropSpots.value = emptyPossibleBoardSpots(boardLength);
				runOnJS(broadcastHoverState)(null, null, null);
				return;
			}
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

				// Play combo/break sound and update global active combo
				runOnJS(playComboSound)(combo.value);
				runOnJS(updateActiveCombo)(combo.value);
				
				if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.vibrate) {
					navigator.vibrate([25, 45, 25]);
				}
				
				pointsEarned += linesBroken * boardLength * (combo.value / 2) * pieceBlockCount;
				score.value += pointsEarned;

				// Garbage Attack
				const currentComboVal = combo.value;
				const attackLines = Math.min(4, (linesBroken - 1) + (currentComboVal >= 2 ? currentComboVal - 1 : 0));
				if (attackLines > 0) {
					runOnJS(sendGarbageAttack)(attackLines);
				}
			} else {
				score.value += pointsEarned;
				lastBrokenLine.value++;
				if (lastBrokenLine.value >= handSize) {
					combo.value = 0;
					runOnJS(updateActiveCombo)(0);
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
				nextHand = createRandomHandWorklet(handSize, gameMode);
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
		if (isNaN(dropX) || isNaN(dropY)) {
			board.value = clearHoverBlocks([...board.value]);
			runOnJS(broadcastHoverState)(draggingPiece.value, null, null);
			return;
		}
		const piece: PieceData = hand.value[draggingPiece.value!]!;

		const newBoard = clearHoverBlocks([...board.value]);
		updateHoveredBreaks(newBoard, piece, dropX, dropY);

		board.value = newBoard;

		runOnJS(broadcastHoverState)(draggingPiece.value, dropX, dropY);
	};

    const handleExit = () => {
        setAppState(MenuStateType.MENU);
    };

    const renderSpectatorBoard = (
        name: string,
        elo: number | null,
        boardData: Board,
        handData: Hand,
        scoreVal: number,
        isOver: boolean,
        hoverData: any,
        roleKey: 'player1' | 'player2'
    ) => {
        const badge = elo !== null ? getEloBadge(elo) : null;
        const emotesList = roleKey === 'player1' ? p1Emotes : p2Emotes;
        return (
            <View style={styles.spectatorBoardCol}>
                <View style={styles.opponentHeader}>
                    <Text style={[styles.opponentNameText, { color: currentTheme.textPrimary }]}>
                        {name} {badge ? `[${badge.tier} - ${elo}]` : ""} {isOver && "(GameOver)"}
                    </Text>
                    <Text style={[styles.opponentScoreText, { color: currentTheme.accent }]}>
                        Score: {scoreVal}
                    </Text>
                </View>
                <View style={styles.spectatorGridWrapper}>
                    <ReadOnlyBlockGrid 
                        board={boardData} 
                        gridBlockSize={isLargeScreen ? GRID_BLOCK_SIZE * 0.8 : 14} 
                        hoverIndex={hoverData.index}
                        hoverX={hoverData.x}
                        hoverY={hoverData.y}
                        hand={handData}
                    />
                    <View style={styles.emotesOverlay}>
                        {emotesList.map(e => (
                            <FloatingEmote 
                                key={e.id} 
                                text={e.text} 
                                onComplete={() => {
                                    if (roleKey === 'player1') {
                                        setP1Emotes(prev => prev.filter(x => x.id !== e.id));
                                    } else {
                                        setP2Emotes(prev => prev.filter(x => x.id !== e.id));
                                    }
                                }} 
                            />
                        ))}
                    </View>
                </View>
                <View style={{ marginTop: 10, alignItems: 'center' }}>
                    <ReadOnlyHandPieces hand={handData} boardSize={boardLength} scale={isLargeScreen ? 0.65 : 0.5} />
                </View>
            </View>
        );
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

    const myBadge = getEloBadge(playerElo);
    const oppBadge = opponentElo !== null ? getEloBadge(opponentElo) : null;

	return (        
		<SafeAreaView style={[styles.root, { backgroundColor: 'transparent' }]}>
			<GestureHandlerRootView style={styles.root}>
                <StickyGameHud gameMode={gameMode} score={score}></StickyGameHud>
				
				{isSpectating ? (
					<View style={styles.spectatorContainer}>
                        <View style={styles.liveContainer}>
                            <LiveDot />
                            <Text style={[styles.spectatorTitle, { color: currentTheme.accent }]}>
                                Live Spectator Mode
                            </Text>
                        </View>
                        <Text style={[styles.spectatorRoomTitle, { color: currentTheme.textSecondary }]}>
                            Watching: {opponentName}
                        </Text>

                        <ScrollView contentContainerStyle={isLargeScreen ? styles.spectatorRow : styles.spectatorStack} style={{ width: '100%', flex: 1 }} nestedScrollEnabled={true}>
                            {renderSpectatorBoard(player1Name, player1Elo, player1Board, player1Hand, player1Score, player1IsGameOver, player1Hover, 'player1')}
                            {renderSpectatorBoard(player2Name, player2Elo, player2Board, player2Hand, player2Score, player2IsGameOver, player2Hover, 'player2')}
                        </ScrollView>

						<View style={{ marginVertical: 15 }}>
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
										{opponentName} {oppBadge ? `[${oppBadge.tier} - ${opponentElo}]` : ""} {opponentIsGameOver && "(GameOver)"}
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
									<View style={styles.emotesOverlay}>
										{(myRole === 'player1' ? p2Emotes : p1Emotes).map(e => (
											<FloatingEmote 
												key={e.id} 
												text={e.text} 
												onComplete={() => {
													if (myRole === 'player1') {
														setP2Emotes(prev => prev.filter(x => x.id !== e.id));
													} else {
														setP1Emotes(prev => prev.filter(x => x.id !== e.id));
													}
												}} 
											/>
										))}
									</View>
								</View>

								<View style={{ alignItems: 'center', marginLeft: isShortScreen ? 4 : 10 }}>
									<ReadOnlyHandPieces hand={opponentHand} boardSize={boardLength} scale={isShortScreen ? 0.4 : 0.5} />
								</View>
							</View>
						)}

						{/* Local Player's board */}
						<View style={styles.gameColumn}>
							{isLargeScreen && (
                                <Text style={[styles.playerNameText, { color: currentTheme.textPrimary }]}>
                                    You [{myBadge.tier} - {playerElo}]
                                </Text>
                            )}
							<DndProvider shouldDropWorklet={pieceOverlapsRectangle} springConfig={SPRING_CONFIG_MISSED_DRAG} onBegin={handleBegin} onFinalize={handleFinalize} onDragEnd={handleDragEnd} onUpdate={handleUpdate}>
								<StatsGameHud score={score} combo={combo} lastBrokenLine={lastBrokenLine} hand={hand}></StatsGameHud>
								<View style={{ position: 'relative' }}>
                                    <BlockGrid board={board} possibleBoardDropSpots={possibleBoardDropSpots} hand={hand} draggingPiece={draggingPiece}></BlockGrid>
                                    <View style={styles.emotesOverlay}>
                                        {(myRole === 'player1' ? p1Emotes : p2Emotes).map(e => (
                                            <FloatingEmote 
                                                key={e.id} 
                                                text={e.text} 
                                                onComplete={() => {
                                                    if (myRole === 'player1') {
                                                        setP1Emotes(prev => prev.filter(x => x.id !== e.id));
                                                    } else {
                                                        setP2Emotes(prev => prev.filter(x => x.id !== e.id));
                                                    }
                                                }} 
                                            />
                                        ))}
                                    </View>
                                </View>
								<View style={[StyleSheet.absoluteFill, { pointerEvents: 'none', zIndex: 9999 }]}>
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
                                
                                <View style={styles.emoteButtonsRow}>
                                    <StylizedButton text="Oops" onClick={() => sendEmote("Oops")} backgroundColor="rgba(0,0,0,0.4)" style={styles.emoteBtn} textStyle={{ fontSize: 10 }} />
                                    <StylizedButton text="OMG" onClick={() => sendEmote("OMG")} backgroundColor="rgba(0,0,0,0.4)" style={styles.emoteBtn} textStyle={{ fontSize: 10 }} />
                                    <StylizedButton text="EZ" onClick={() => sendEmote("EZ")} backgroundColor="rgba(0,0,0,0.4)" style={styles.emoteBtn} textStyle={{ fontSize: 10 }} />
                                    <StylizedButton text="GG" onClick={() => sendEmote("GG")} backgroundColor="rgba(0,0,0,0.4)" style={styles.emoteBtn} textStyle={{ fontSize: 10 }} />
                                </View>

								<HandPieces 
									hand={hand} 
									boardSize={boardLength}
									onHandChange={(newHand) => {
										broadcastState(board.value, newHand, score.value, combo.value, lastBrokenLine.value, false);
									}}
								/>
							</DndProvider>
						</View>

						{/* On desktop, render opponent's board on the right */}
						{isLargeScreen && (
							<View style={styles.opponentColumn}>
								<View style={styles.opponentHeader}>
									<Text style={[styles.opponentNameText, { color: currentTheme.textSecondary }]}>
										{opponentName} {oppBadge ? `[${oppBadge.tier} - ${opponentElo}]` : ""} {opponentIsGameOver && "(GameOver)"}
									</Text>
									<Text style={[styles.opponentScoreText, { color: currentTheme.accent }]}>
										Score: {opponentScore}
									</Text>
								</View>

								<View style={{ position: 'relative' }}>
									<ReadOnlyBlockGrid 
										board={opponentBoard} 
										gridBlockSize={GRID_BLOCK_SIZE} 
										hoverIndex={opponentHover.index}
										hoverX={opponentHover.x}
										hoverY={opponentHover.y}
										hand={opponentHand}
									/>
                                    <View style={styles.emotesOverlay}>
                                        {(myRole === 'player1' ? p2Emotes : p1Emotes).map(e => (
                                            <FloatingEmote 
                                                key={e.id} 
                                                text={e.text} 
                                                onComplete={() => {
                                                    if (myRole === 'player1') {
                                                        setP2Emotes(prev => prev.filter(x => x.id !== e.id));
                                                    } else {
                                                        setP1Emotes(prev => prev.filter(x => x.id !== e.id));
                                                    }
                                                }} 
                                            />
                                        ))}
                                    </View>
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
        transform: [{ scale: 1.0 }],
        position: 'relative'
    },
    opponentHeader: {
        alignItems: 'center',
        marginBottom: 10
    },
    playerNameText: {
        fontSize: 18,
        fontFamily: 'Silkscreen',
        marginBottom: 5
    },
    opponentNameText: {
        fontSize: 15,
        fontFamily: 'Silkscreen',
    },
    opponentScoreText: {
        fontSize: 16,
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
        fontSize: 18,
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
    },
    emoteButtonsRow: {
        flexDirection: 'row',
        gap: 8,
        marginVertical: 6,
        justifyContent: 'center',
        alignItems: 'center'
    },
    emoteBtn: {
        minWidth: 50,
        height: 28,
        paddingHorizontal: 6,
    },
    emotesOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        pointerEvents: 'none',
        zIndex: 9999
    },
    emoteBubble: {
        position: 'absolute',
        backgroundColor: 'rgba(0,0,0,0.85)',
        borderColor: '#ff00ff',
        borderWidth: 1.5,
        borderRadius: 15,
        paddingHorizontal: 12,
        paddingVertical: 6,
        alignSelf: 'center',
    },
    emoteText: {
        color: '#fff',
        fontFamily: 'Silkscreen',
        fontSize: 14,
        fontWeight: 'bold'
    },
    spectatorRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: 30,
        paddingVertical: 10
    },
    spectatorStack: {
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
        paddingVertical: 10
    },
    spectatorBoardCol: {
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.4)',
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#333',
    },
    spectatorGridWrapper: {
        position: 'relative',
        marginVertical: 8
    },
    spectatorRoomTitle: {
        fontFamily: 'Silkscreen',
        fontSize: 14,
        marginBottom: 10
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
