import React from "react";
import {
	Board,
	BoardBlockType,
	forEachBoardBlock,
	PossibleBoardSpots,
	useGameSizes
} from "@/constants/Board";
import { Color, colorToHex } from "@/constants/Color";
import { Hand } from "@/constants/Hand";
import {
	createEmptyBlockStyle,
	createFilledBlockStyle,
} from "@/constants/Piece";
import { shopStateAtom } from "@/constants/Shop";
import { Theme, useTheme } from "@/constants/Theme";
import { useDroppable } from "@mgcrea/react-native-dnd";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { StyleSheet, Platform, View } from "react-native";
import Animated, {
	SharedValue,
	interpolateColor,
	runOnJS,
	useAnimatedReaction,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";

interface BlockGridProps {
	board: SharedValue<Board>;
	possibleBoardDropSpots: SharedValue<PossibleBoardSpots>;
	hand: SharedValue<Hand>;
	draggingPiece: SharedValue<number | null>;
}

const PARTICLE_CONFIGS = Platform.OS === "web" ? [
	{ angle: 0.0, speed: 1.0 },
	{ angle: Math.PI / 4, speed: 1.3 },
	{ angle: Math.PI / 2, speed: 0.8 },
	{ angle: 3 * Math.PI / 4, speed: 1.5 },
] : [];

interface SparkParticleProps {
	sparkProgress: SharedValue<number>;
	index: number;
	x: number;
	y: number;
	gridBlockSize: number;
	board: SharedValue<Board>;
}

function SparkParticle({ sparkProgress, index, x, y, gridBlockSize, board }: SparkParticleProps) {
	const animatedStyle = useAnimatedStyle(() => {
		const progress = sparkProgress.value;
		if (progress === 0 || progress === 1) {
			return { opacity: 0, transform: [{ scale: 0 }] };
		}

		const config = PARTICLE_CONFIGS[index];
		const cellOffset = ((x * 17 + y * 23) % 10) / 10;
		const angle = config.angle + cellOffset * Math.PI * 0.25;
		const speed = config.speed * (0.8 + cellOffset * 0.4);

		const maxDist = gridBlockSize * 2.2;
		const distance = progress * maxDist * speed;

		const tx = Math.cos(angle) * distance;
		const ty = Math.sin(angle) * distance;

		const scale = (1 - progress) * 1.5;
		const opacity = progress < 0.15 ? progress / 0.15 : (1 - progress);

		const block = board.value[y][x];
		const colorHex = colorToHex(block.color);

		return {
			position: 'absolute',
			width: 6,
			height: 6,
			borderRadius: 3,
			backgroundColor: colorHex,
			opacity: opacity,
			transform: [
				{ translateX: tx + (gridBlockSize / 2) - 3 },
				{ translateY: ty + (gridBlockSize / 2) - 3 },
				{ scale: scale }
			],
			shadowColor: colorHex,
			shadowOffset: { width: 0, height: 0 },
			shadowOpacity: 1,
			shadowRadius: 5,
			elevation: 3,
		};
	});

	return <Animated.View style={[styles.pointerEventsNone, animatedStyle]} />;
}

interface GridBlockProps {
	x: number;
	y: number;
	board: SharedValue<Board>;
	boardSize: number;
	gridBlockSize: number;
	currentTheme: Theme;
	pieceSkinId: string;
	/** Whether the cell was empty when it went live (it then joins the opening light sweep). */
	startsEmpty: boolean;
	/** The colour of the block it held when it went live. */
	startColor: Color;
}

// Memoised like BlockDroppable below: while the board goes live row by row, a re-render of the grid must not set up
// every cell that is already live again.
const GridBlock = React.memo(function GridBlock({ x, y, board, boardSize, gridBlockSize, currentTheme, pieceSkinId, startsEmpty, startColor }: GridBlockProps) {
	// The board has 64-100 cells and every hook here is paid once per cell when a game opens (it took seconds on a
	// phone), so a cell keeps as few shared values and animated styles as it can: the break direction is fixed per
	// cell, the white flash is drawn by the static style, and the spark progress exists only where sparks are drawn.
	const loadBlockFlash = useSharedValue(0);
	const placedBlockFall = useSharedValue(0);
	const waveEffect = useSharedValue(0);
	const flashOpacity = useSharedValue(0);
	// eslint-disable-next-line react-hooks/rules-of-hooks -- PARTICLE_CONFIGS is fixed per platform, so the hook count never changes
	const sparkProgress = PARTICLE_CONFIGS.length > 0 ? useSharedValue(0) : null;
	const cellSeed = (x * 7919 + y * 104729 + 31) % 100003;
	const fallAngle = ((cellSeed % 628) / 100);
	const fallDistance = 50 + (cellSeed % 100);
	const fallDirectionX = Math.cos(fallAngle) * fallDistance;
	const fallDirectionY = Math.sin(fallAngle) * fallDistance;
	const fallRotation = ((cellSeed * 7) % 720) - 360;

	// Реакция на изменение состояния блока
	useAnimatedReaction(() => {
		return board.value[y][x].blockType;
	}, (cur, prev) => {
		// Анимация при удалении блока
		if (cur === BoardBlockType.EMPTY && (prev === BoardBlockType.FILLED || prev === BoardBlockType.HOVERED_BREAK_EMPTY || prev === BoardBlockType.HOVERED_BREAK_FILLED)) {
			flashOpacity.value = withSequence(
				withTiming(1, { duration: 100 }),
				withTiming(0, { duration: 250 })
			);


			placedBlockFall.value = withSequence(
				withTiming(1, { duration: 600 }),
				withTiming(0, { duration: 0 })
			);

			if (sparkProgress) {
				sparkProgress.value = 0;
				sparkProgress.value = withTiming(1, { duration: 550 });
			}
		}
		// Сброс анимации при размещении нового блока
		else if (cur === BoardBlockType.FILLED && prev === BoardBlockType.EMPTY) {
			placedBlockFall.value = 0;
			if (sparkProgress) sparkProgress.value = 0;
		}
		// Анимация волны для блоков, которые будут разрушены
		else if ((cur === BoardBlockType.HOVERED_BREAK_FILLED || cur === BoardBlockType.HOVERED_BREAK_EMPTY) &&
				(prev === BoardBlockType.FILLED || prev === BoardBlockType.EMPTY)) {
			waveEffect.value = withRepeat(
				withTiming(1, { duration: 400 }),
				-1,
				true
			);
		}
		// Сброс анимации волны
		else if ((cur === BoardBlockType.FILLED || cur === BoardBlockType.EMPTY) &&
				(prev === BoardBlockType.HOVERED_BREAK_FILLED || prev === BoardBlockType.HOVERED_BREAK_EMPTY)) {
			waveEffect.value = 0;
		}
	});

	// Анимация загрузки блоков при первом рендере
	useEffect(() => {
		if (!startsEmpty)
			return;
		const step = 70;
		const upwardDelay = (boardSize - 1 - y) * step;
		const downwardDelay = 2 * y * step;

		loadBlockFlash.value = withDelay(
			upwardDelay,
			withSequence(
				withTiming(1, { duration: step }),
				withDelay(downwardDelay, withTiming(0, { duration: step }))
			)
		);
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const staticStyle = useAnimatedStyle(() => {
		// Reanimated runs a style once on the JS thread (runtime kind 1) for the first frame; reading the board there would copy it
		// across runtimes for every cell, so that run draws the cell from its props and the UI thread takes over.
		if ((globalThis as { __RUNTIME_KIND?: number }).__RUNTIME_KIND === 1) {
			return startsEmpty ? createEmptyBlockStyle(currentTheme.emptyBlockBorder) : { ...createFilledBlockStyle(startColor, 7, pieceSkinId), opacity: 1, transform: [] };
		}
		const block = board.value[y][x];

		if (block.blockType === BoardBlockType.EMPTY) {
			// the load sweep is a faint glow, the flash of a cleared block is near white
			const flashVal = Math.max(loadBlockFlash.value * 0.15, flashOpacity.value * 0.9);
			if (flashVal > 0.0075) {
				return {
					...createEmptyBlockStyle(currentTheme.emptyBlockBorder),
					backgroundColor: `rgba(255, 255, 255, ${flashVal})`,
				};
			}
			return createEmptyBlockStyle(currentTheme.emptyBlockBorder);
		}

		let style: any = createEmptyBlockStyle(currentTheme.emptyBlockBorder);
		if (block.blockType === BoardBlockType.FILLED || block.blockType === BoardBlockType.HOVERED) {
			style = {
				...createFilledBlockStyle(block.color, 7, pieceSkinId),
				opacity: block.blockType === BoardBlockType.HOVERED ? 0.45 : 1,
				transform: []
			};
		}
		// Улучшенная анимация для блоков, которые будут разрушены
		else if (block.blockType === BoardBlockType.HOVERED_BREAK_EMPTY || block.blockType === BoardBlockType.HOVERED_BREAK_FILLED) {
			const blockColor = block.blockType === BoardBlockType.HOVERED_BREAK_EMPTY ? block.color : block.hoveredBreakColor;

			// Волновой эффект
			const waveScale = 1 + (waveEffect.value * 0.1);

			style = {
				...createFilledBlockStyle(blockColor, 7, pieceSkinId),
				borderWidth: 2,
				borderColor: interpolateColor(
					waveEffect.value,
					[0, 0.5, 1],
					['rgba(255, 255, 255, 0.4)', 'rgba(255, 255, 255, 1)', 'rgba(255, 255, 255, 0.4)']
				),
				transform: [
					{ scale: waveScale }
				],
				zIndex: 10
			};
		}

		return style;
	});

	const fallingStyle = useAnimatedStyle(() => {
		if (placedBlockFall.value > 0) {
			const block = board.value[y][x];
			let progress = placedBlockFall.value;
			progress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress); // easeOutCirc
			return {
				...createFilledBlockStyle(block.color, 7, pieceSkinId),
				opacity: 1 - progress,
				transform: [
					{ scale: 1 - progress * 0.5 },
					{ translateX: fallDirectionX * progress },
					{ translateY: fallDirectionY * progress },
					{ rotate: `${fallRotation * progress}deg` }
				],
				position: 'absolute',
				top: 0,
				left: 0,
				width: gridBlockSize,
				height: gridBlockSize,
				zIndex: 20
			};
		}
		return { opacity: 0, width: 0, height: 0, position: 'absolute' };
	});

	return (
		<>
			<Animated.View style={[staticStyle, { width: gridBlockSize, height: gridBlockSize, justifyContent: 'center', alignItems: 'center' }]} />
			<Animated.View style={fallingStyle} />
			{PARTICLE_CONFIGS.map((_, i) => (
				<SparkParticle
					key={`spark-${i}`}
					sparkProgress={sparkProgress!}
					index={i}
					x={x}
					y={y}
					gridBlockSize={gridBlockSize}
					board={board}
				/>
			))}
		</>
	);
});

function BlockGridView({
	board,
	possibleBoardDropSpots,
	draggingPiece,
	hand
}: BlockGridProps) {
	// Opening a game used to block for a second or more while every cell set up its animations. The grid now shows
	// plain cells at once and swaps in the animated ones a couple of rows per frame, under the opening light sweep.
	// Reading a shared value on the JS thread is a synchronous trip to the UI runtime that copies the whole board, so
	// a render reads it once; reading it once per cell took about half a second per render on a phone.
	const snapshot = board.value;
	const boardLength = snapshot.length;
	const [liveRows, setLiveRows] = useState(0);
	useEffect(() => {
		const rowsTotal = boardLength;
		if (liveRows >= rowsTotal) return;
		const frame = requestAnimationFrame(() => setLiveRows((rows) => Math.min(rowsTotal, rows + 2)));
		return () => cancelAnimationFrame(frame);
	}, [liveRows, boardLength]);
	const blockElements: any[] = [];

	const { currentTheme } = useTheme();
	const pieceSkinId = useAtomValue(shopStateAtom).equipped.piece_skin;
	const { GRID_BLOCK_SIZE, HITBOX_SIZE } = useGameSizes(boardLength);

	forEachBoardBlock(snapshot, (block, x, y) => {
		const blockPositionStyle = {
			position: "absolute" as const,
			top: y * GRID_BLOCK_SIZE,
			left: x * GRID_BLOCK_SIZE,
			width: GRID_BLOCK_SIZE,
			height: GRID_BLOCK_SIZE,
		};

		const live = y < liveRows;
		const plainStyle = live ? null : (block.blockType === BoardBlockType.EMPTY ? createEmptyBlockStyle(currentTheme.emptyBlockBorder) : createFilledBlockStyle(block.color, 7, pieceSkinId));
		blockElements.push(
			<Animated.View key={`${x},${y}`} style={blockPositionStyle}>
				{!live ? <View style={[plainStyle, { width: GRID_BLOCK_SIZE, height: GRID_BLOCK_SIZE }]} /> : <GridBlock
					x={x}
					y={y}
					board={board}
					boardSize={boardLength}
					gridBlockSize={GRID_BLOCK_SIZE}
					currentTheme={currentTheme}
					pieceSkinId={pieceSkinId}
					startsEmpty={block.blockType === BoardBlockType.EMPTY}
					startColor={block.color}
				/>}
				<BlockDroppable
					x={x}
					y={y}
					style={styles.hitbox}
					possibleBoardDropSpots={possibleBoardDropSpots}
					hitboxSize={HITBOX_SIZE}
					gridBlockSize={GRID_BLOCK_SIZE}
				></BlockDroppable>
			</Animated.View>
		);
	});

	const gridStyle = useAnimatedStyle(() => {
		const activeIndex = draggingPiece.value;
		const activePiece = activeIndex !== null ? hand.value[activeIndex] : null;
		if (!activePiece) {
			return {
				borderColor: currentTheme.gridBorder
			};
		}
		return {
			borderColor: colorToHex(activePiece.color)
		};
	});

	return (
		<Animated.View
			style={[
				styles.grid,
				{
					width: GRID_BLOCK_SIZE * boardLength + 6,
					height: GRID_BLOCK_SIZE * boardLength + 6,
					backgroundColor: currentTheme.gridBackground,
				},
				gridStyle
			]}
		>
			{blockElements}
		</Animated.View>
	);
}

interface BlockDroppableProps {
	children?: any;
	x: number;
	y: number;
	style: any;
	possibleBoardDropSpots: SharedValue<PossibleBoardSpots>;
	hitboxSize: number;
	gridBlockSize: number;
}

const BlockDroppable = React.memo(function BlockDroppable({
	children,
	x,
	y,
	style,
	possibleBoardDropSpots,
	hitboxSize,
	gridBlockSize,
	...otherProps
}: BlockDroppableProps) {
	const id = `${x},${y}`;
	const { props } = useDroppable({
		id,
	});

	const updateLayout = () => {
		// this is a weird solution, but pretty much there is a race condition with updating layout immediately
		// after returning a style within useAnimatedStyle on the UI thread
		// 20ms should be good (> 1000ms/60)
		setTimeout(() => {
			(props.onLayout as any)(null);
		}, 1000 / 60);
	};

	useAnimatedReaction(() => {
		const row = possibleBoardDropSpots.value[y];
		return row ? row[x] === 1 : false;
	}, (active, previousActive) => {
		if (previousActive !== undefined && active !== previousActive) {
			runOnJS(updateLayout)();
		}
	});

	const animatedStyle = useAnimatedStyle(() => {
		// nothing can be dropped before a drag starts, so the first (JS thread) run needs no trip for the drop spots
		if ((globalThis as { __RUNTIME_KIND?: number }).__RUNTIME_KIND === 1) return { width: 0, height: 0 };
		const row = possibleBoardDropSpots.value[y];
		const active = row ? row[x] === 1 : false;
		if (active) {
			// use a smaller size droppable than the block so that detection does not overlap with other blocks.
			return {
				width: hitboxSize,
				height: hitboxSize,
				top: (gridBlockSize - hitboxSize) / 2,
				left: (gridBlockSize - hitboxSize) / 2,
			};
		} else {
			return {
				width: 0,
				height: 0,
			};
		}
	});

	return (
		<Animated.View
			{...props}
			{...otherProps}
			style={[style, animatedStyle]}
		>
			{children}
		</Animated.View>
	);
});

const styles = StyleSheet.create({
	grid: {
		borderWidth: 3,
		borderRadius: 2,
		position: "relative",
		zIndex: 1,
		...Platform.select({
			web: {
				boxShadow: "0px 4px 8px rgba(0, 0, 0, 0.3)"
			},
			default: {
				shadowColor: "#000",
				shadowOffset: { width: 0, height: 4 },
				shadowOpacity: 0.3,
				shadowRadius: 8,
				elevation: 8,
			}
		})
	},
	hitbox: {
		position: "absolute",
	},
	pointerEventsNone: {
		pointerEvents: 'none',
	},
});

interface ReadOnlyBlockGridProps {
	board: Board;
	gridBlockSize: number;
	hoverIndex?: number | null;
	hoverX?: number | null;
	hoverY?: number | null;
	hand?: Hand;
}

export function ReadOnlyBlockGrid({ board, gridBlockSize, hoverIndex, hoverX, hoverY, hand }: ReadOnlyBlockGridProps) {
	const blockElements: any[] = [];
	const boardLength = board.length;
	const { currentTheme } = useTheme();
	const pieceSkinId = useAtomValue(shopStateAtom).equipped.piece_skin;

	// Calculate which cells are covered by the opponent's dragging piece
	const hoverCells = new Set<string>();
	let hoverColor = { r: 255, g: 255, b: 255 }; // default color
	if (
		hoverIndex !== null && hoverIndex !== undefined &&
		hoverX !== null && hoverX !== undefined &&
		hoverY !== null && hoverY !== undefined &&
		hand
	) {
		const piece = hand[hoverIndex];
		if (piece) {
			hoverColor = piece.color;
			const pieceHeight = piece.matrix.length;
			const pieceWidth = piece.matrix[0].length;
			for (let py = 0; py < pieceHeight; py++) {
				for (let px = 0; px < pieceWidth; px++) {
					if (piece.matrix[py][px] >= 1) {
						const bx = hoverX + px;
						const by = hoverY + py;
						if (bx >= 0 && bx < boardLength && by >= 0 && by < boardLength) {
							hoverCells.add(`${bx},${by}`);
						}
					}
				}
			}
		}
	}

	forEachBoardBlock(board, (block, x, y) => {
		const blockPositionStyle = {
			position: "absolute" as const,
			top: y * gridBlockSize,
			left: x * gridBlockSize,
			width: gridBlockSize,
			height: gridBlockSize,
		};

		let blockStyle: any;
		const isFilledOrHoveredBreak = block.blockType === BoardBlockType.FILLED || block.blockType === BoardBlockType.HOVERED_BREAK_FILLED;
		const isHoverCell = hoverCells.has(`${x},${y}`);

		if (isFilledOrHoveredBreak) {
			blockStyle = createFilledBlockStyle(block.color, Math.max(1, Math.round(gridBlockSize * 0.15)), pieceSkinId);
		} else if (isHoverCell) {
			// Render ghost preview for opponent's drag
			blockStyle = {
				...createFilledBlockStyle(hoverColor, Math.max(1, Math.round(gridBlockSize * 0.15)), pieceSkinId),
				opacity: 0.35,
				borderWidth: 1,
				borderColor: 'rgba(255, 255, 255, 0.8)'
			};
		} else {
			blockStyle = createEmptyBlockStyle(currentTheme.emptyBlockBorder);
		}

		blockElements.push(
			<View key={`${x},${y}`} style={[blockPositionStyle, blockStyle, { width: gridBlockSize, height: gridBlockSize, justifyContent: 'center', alignItems: 'center' }]} />
		);
	});

	return (
		<View
			style={[
				styles.grid,
				{
					width: gridBlockSize * boardLength + 6,
					height: gridBlockSize * boardLength + 6,
					backgroundColor: currentTheme.gridBackground,
					borderColor: currentTheme.gridBorder,
				}
			]}
		>
			{blockElements}
		</View>
	);
}

// Memoised: its props are shared values that never change identity, and a re-render of every cell (or hand block)
// cost the JS thread up to a second each time the game re-rendered for a score popup.
const BlockGrid = React.memo(BlockGridView);
export default BlockGrid;
