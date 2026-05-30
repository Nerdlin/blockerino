import {
	Board,
	BoardBlockType,
	forEachBoardBlock,
	GRID_BLOCK_SIZE,
	HITBOX_SIZE,
	PossibleBoardSpots,
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
import { StyleSheet, Platform } from "react-native";
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

interface GridBlockProps {
	x: number;
	y: number;
	board: SharedValue<Board>;
	boardSize: number;
}

function GridBlock({ x, y, board, boardSize }: GridBlockProps) {
	const loadBlockFlash = useSharedValue(0);
	const placedBlockFall = useSharedValue(0);
	const placedBlockDirectionX = useSharedValue(0);
	const placedBlockDirectionY = useSharedValue(0);
	const placedBlockRotation = useSharedValue(0);
	const waveEffect = useSharedValue(0);
	const { currentTheme } = useTheme();

	// Реакция на изменение состояния блока
	useAnimatedReaction(() => {
		return board.value[y][x].blockType;
	}, (cur, prev) => {
		// Анимация при удалении блока
		if (cur === BoardBlockType.EMPTY && (prev === BoardBlockType.FILLED || prev === BoardBlockType.HOVERED_BREAK_EMPTY || prev === BoardBlockType.HOVERED_BREAK_FILLED)) {
			const angle = Math.random() * Math.PI * 2;
			const distance = 50 + Math.random() * 100;
			placedBlockDirectionX.value = Math.cos(angle) * distance;
			placedBlockDirectionY.value = Math.sin(angle) * distance;
			placedBlockRotation.value = (Math.random() - 0.5) * 720;

			placedBlockFall.value = withSequence(
				withTiming(1, { duration: 600 }),
				withTiming(0, { duration: 16 })
			);
		}
		// Сброс анимации при размещении нового блока
		else if (cur === BoardBlockType.FILLED && prev === BoardBlockType.EMPTY) {
			placedBlockFall.value = 0;
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
	}, [board.value[y][x].blockType, boardSize, loadBlockFlash, x, y]);

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
				width: GRID_BLOCK_SIZE,
				height: GRID_BLOCK_SIZE,
				zIndex: 20
			};
		}
		return { opacity: 0, width: 0, height: 0, position: 'absolute' };
	});

	return (
		<>
			<Animated.View style={[staticStyle, { width: GRID_BLOCK_SIZE, height: GRID_BLOCK_SIZE }]} />
			<Animated.View style={fallingStyle} />
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

	forEachBoardBlock(board.value, (_block, x, y) => {
		const blockPositionStyle = {
			position: "absolute" as const,
			top: y * GRID_BLOCK_SIZE + 3,
			left: x * GRID_BLOCK_SIZE + 3,
			width: GRID_BLOCK_SIZE,
			height: GRID_BLOCK_SIZE,
		};

		blockElements.push(
			<Animated.View key={`${x},${y}`} style={blockPositionStyle}>
				<GridBlock x={x} y={y} board={board} boardSize={boardLength} />
				<BlockDroppable
					x={x}
					y={y}
					style={styles.hitbox}
					possibleBoardDropSpots={possibleBoardDropSpots}
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
}

function BlockDroppable({
	children,
	x,
	y,
	style,
	possibleBoardDropSpots,
	...otherProps
}: BlockDroppableProps) {
	const id = `${x},${y}`;
	const { props, activeId } = useDroppable({
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
				width: HITBOX_SIZE,
				height: HITBOX_SIZE,
				top: (GRID_BLOCK_SIZE - HITBOX_SIZE) / 2,
				left: (GRID_BLOCK_SIZE - HITBOX_SIZE) / 2,
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
		borderRadius: 8,
		position: "relative",
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
});
