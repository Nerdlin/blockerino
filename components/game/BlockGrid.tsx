import {
	Board,
	BoardBlockType,
	forEachBoardBlock,
	PossibleBoardSpots,
	useGameSizes
} from "@/constants/Board";
import { colorToHex } from "@/constants/Color";
import { Hand } from "@/constants/Hand";
import {
	createEmptyBlockStyle,
	createFilledBlockStyle,
} from "@/constants/Piece";
import { useTheme } from "@/constants/Theme";
import { useDroppable } from "@mgcrea/react-native-dnd";
import { useEffect } from "react";
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

const PARTICLE_CONFIGS = [
	{ angle: 0.0, speed: 1.0 },
	{ angle: Math.PI / 4, speed: 1.3 },
	{ angle: Math.PI / 2, speed: 0.8 },
	{ angle: 3 * Math.PI / 4, speed: 1.5 },
	{ angle: Math.PI, speed: 1.1 },
	{ angle: 5 * Math.PI / 4, speed: 0.9 },
	{ angle: 3 * Math.PI / 2, speed: 1.4 },
	{ angle: 7 * Math.PI / 4, speed: 0.7 },
];

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
}

function GridBlock({ x, y, board, boardSize, gridBlockSize }: GridBlockProps) {
	const loadBlockFlash = useSharedValue(0);
	const placedBlockFall = useSharedValue(0);
	const placedBlockDirectionX = useSharedValue(0);
	const placedBlockDirectionY = useSharedValue(0);
	const placedBlockRotation = useSharedValue(0);
	const waveEffect = useSharedValue(0);
	const flashOpacity = useSharedValue(0);
	const sparkProgress = useSharedValue(0);
	const { currentTheme } = useTheme();

	const pulseAnim = useSharedValue(1);
	useEffect(() => {
		pulseAnim.value = withRepeat(
			withSequence(
				withTiming(1.15, { duration: 400 }),
				withTiming(0.95, { duration: 400 })
			),
			-1,
			true
		);
	}, [pulseAnim]);

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

			const angle = Math.random() * Math.PI * 2;
			const distance = 50 + Math.random() * 100;
			placedBlockDirectionX.value = Math.cos(angle) * distance;
			placedBlockDirectionY.value = Math.sin(angle) * distance;
			placedBlockRotation.value = (Math.random() - 0.5) * 720;

			placedBlockFall.value = withSequence(
				withTiming(1, { duration: 600 }),
				withTiming(0, { duration: 16 })
			);

			sparkProgress.value = 0;
			sparkProgress.value = withTiming(1, { duration: 550 });
		}
		// Сброс анимации при размещении нового блока
		else if (cur === BoardBlockType.FILLED && prev === BoardBlockType.EMPTY) {
			placedBlockFall.value = 0;
			sparkProgress.value = 0;
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
		if (board.value[y][x].blockType !== BoardBlockType.EMPTY)
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
		const block = board.value[y][x];

		if (block.blockType === BoardBlockType.EMPTY && loadBlockFlash.value !== 0) {
			return {
				...createFilledBlockStyle(block.color),
				opacity: Math.min(1, loadBlockFlash.value * 10),
				borderColor: currentTheme.emptyBlockBorder
			};
		}

		let style: any = createEmptyBlockStyle(currentTheme.emptyBlockBorder);
		if (block.blockType === BoardBlockType.FILLED || block.blockType === BoardBlockType.HOVERED) {
			style = {
				...createFilledBlockStyle(block.color),
				opacity: block.blockType === BoardBlockType.HOVERED ? 0.3 : 1,
				transform: []
			};
		}
		// Улучшенная анимация для блоков, которые будут разрушены
		else if (block.blockType === BoardBlockType.HOVERED_BREAK_EMPTY || block.blockType === BoardBlockType.HOVERED_BREAK_FILLED) {
			const blockColor = block.blockType === BoardBlockType.HOVERED_BREAK_EMPTY ? block.color : block.hoveredBreakColor;

			// Волновой эффект
			const waveScale = 1 + (waveEffect.value * 0.1);

			style = {
				...createFilledBlockStyle(blockColor),
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
		const block = board.value[y][x];
		if (placedBlockFall.value > 0) {
			let progress = placedBlockFall.value;
			progress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress); // easeOutCirc
			return {
				...createFilledBlockStyle(block.color),
				opacity: 1 - progress,
				transform: [
					{ scale: 1 - progress * 0.5 },
					{ translateX: placedBlockDirectionX.value * progress },
					{ translateY: placedBlockDirectionY.value * progress },
					{ rotate: `${placedBlockRotation.value * progress}deg` }
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

	const flashStyle = useAnimatedStyle(() => {
		return {
			opacity: flashOpacity.value,
			backgroundColor: 'white',
			position: 'absolute',
			top: 0,
			left: 0,
			width: gridBlockSize,
			height: gridBlockSize,
			borderRadius: 4,
		};
	});

	return (
		<>
			<Animated.View style={[staticStyle, { width: gridBlockSize, height: gridBlockSize, justifyContent: 'center', alignItems: 'center' }]} />
			<Animated.View style={fallingStyle} />
			<Animated.View style={[styles.pointerEventsNone, flashStyle]} />
			{[...Array(8)].map((_, i) => (
				<SparkParticle
					key={`spark-${i}`}
					sparkProgress={sparkProgress}
					index={i}
					x={x}
					y={y}
					gridBlockSize={gridBlockSize}
					board={board}
				/>
			))}
		</>
	);
}

export default function BlockGrid({
	board,
	possibleBoardDropSpots,
	draggingPiece,
	hand
}: BlockGridProps) {
	const blockElements: any[] = [];
	const boardLength = board.value.length;
	const { currentTheme } = useTheme();
	const { GRID_BLOCK_SIZE, HITBOX_SIZE } = useGameSizes(boardLength);

	forEachBoardBlock(board.value, (_block, x, y) => {
		const blockPositionStyle = {
			position: "absolute" as const,
			top: y * GRID_BLOCK_SIZE,
			left: x * GRID_BLOCK_SIZE,
			width: GRID_BLOCK_SIZE,
			height: GRID_BLOCK_SIZE,
		};

		blockElements.push(
			<Animated.View key={`${x},${y}`} style={blockPositionStyle}>
				<GridBlock x={x} y={y} board={board} boardSize={boardLength} gridBlockSize={GRID_BLOCK_SIZE} />
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
		let style: any;
		if (draggingPiece.value === null) {
			style = {
				borderColor: currentTheme.gridBorder
			};
		} else {
			style = {
				borderColor: colorToHex(hand.value[draggingPiece.value!]!.color)
			};
		}
		return style;
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

function BlockDroppable({
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
}

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
			blockStyle = createFilledBlockStyle(block.color, Math.max(1, Math.round(gridBlockSize * 0.15)));
		} else if (isHoverCell) {
			// Render ghost preview for opponent's drag
			blockStyle = {
				...createFilledBlockStyle(hoverColor, Math.max(1, Math.round(gridBlockSize * 0.15))),
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
