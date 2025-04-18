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
import { StyleSheet } from "react-native";
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
	withSpring,
	withTiming,
} from "react-native-reanimated";

interface BlockGridProps {
	board: SharedValue<Board>;
	possibleBoardDropSpots: SharedValue<PossibleBoardSpots>;
	hand: SharedValue<Hand>;
	draggingPiece: SharedValue<number | null>;
}

function encodeDndId(x: number, y: number): string {
	return `${x},${y}`;
}

function createBlockStyle(x: number, y: number, board: SharedValue<Board>): any {
    const boardSize = board.value.length;
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
        if (cur == BoardBlockType.EMPTY && (prev == BoardBlockType.FILLED || prev == BoardBlockType.HOVERED_BREAK_EMPTY || prev == BoardBlockType.HOVERED_BREAK_FILLED)) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 200;
            const rotation = (Math.random() - 0.5) * Math.PI * 2;
            
            placedBlockDirectionX.value = Math.cos(angle) * distance;
            placedBlockDirectionY.value = Math.sin(angle) * distance;
            placedBlockRotation.value = rotation;
            
            placedBlockFall.value = withTiming(1, { 
                duration: 500 
            }, (finished) => {
                'worklet';
                if (finished) {
                    placedBlockFall.value = 0;
                }
            });
        } 
        // Анимация волны при готовности к разрыву линии
        else if ((cur == BoardBlockType.HOVERED_BREAK_FILLED || cur == BoardBlockType.HOVERED_BREAK_EMPTY) && 
                (prev == BoardBlockType.FILLED || prev == BoardBlockType.EMPTY)) {
            waveEffect.value = withRepeat(
                withTiming(1, { duration: 400 }), 
                -1, 
                true
            );
        }
        // Сброс анимации волны
        else if ((cur == BoardBlockType.FILLED || cur == BoardBlockType.EMPTY) && 
                (prev == BoardBlockType.HOVERED_BREAK_FILLED || prev == BoardBlockType.HOVERED_BREAK_EMPTY)) {
            waveEffect.value = 0;
        }
    });

    // Анимация загрузки блоков при первом рендере
    useEffect(() => {
        if (board.value[y][x].blockType != BoardBlockType.EMPTY) 
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
    }, [board.value[y][x].blockType]);

    const animatedStyle = useAnimatedStyle(() => {
        const block = board.value[y][x];
        
        if (block.blockType == BoardBlockType.EMPTY && loadBlockFlash.value != 0) {
            return {
                ...createFilledBlockStyle(block.color),
                opacity: Math.min(1, loadBlockFlash.value * 10),
                borderColor: currentTheme.emptyBlockBorder
            };
        }

        // Анимация удаления блока
        if (placedBlockFall.value > 0) {
            let progress = placedBlockFall.value;
			progress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress); // easeOutCirc
            return {
                ...createFilledBlockStyle(block.color),
                opacity: 1 - progress,
                transform: [
                    { scale: 1 - progress },
                    { translateX: placedBlockDirectionX.value * progress },
                    { translateY: placedBlockDirectionY.value * progress },
                    { rotate: `${placedBlockRotation.value * progress}rad` }
                ]
            };
        }

        let style: any = createEmptyBlockStyle();
        style.borderColor = currentTheme.emptyBlockBorder;
        
        if (block.blockType == BoardBlockType.FILLED || block.blockType == BoardBlockType.HOVERED) {
            style = {
                ...createFilledBlockStyle(block.color),
                opacity: block.blockType == BoardBlockType.HOVERED ? 0.3 : 1,
                transform: []
            };
        } 
        // Улучшенная анимация для блоков, которые будут разрушены
        else if (block.blockType == BoardBlockType.HOVERED_BREAK_EMPTY || block.blockType == BoardBlockType.HOVERED_BREAK_FILLED) {
            const blockColor = block.blockType == BoardBlockType.HOVERED_BREAK_EMPTY ? block.color : block.hoveredBreakColor;
            
            // Волновой эффект
            const waveScale = 1 + (waveEffect.value * 0.15);
            const glow = waveEffect.value * 15;
            
            style = {
                ...createFilledBlockStyle(blockColor),
                boxShadow: `0px 0px ${glow + 15}px ${colorToHex(blockColor)}`,
                borderWidth: 2,
                borderColor: interpolateColor(
                    waveEffect.value,
                    [0, 0.5, 1],
                    ['rgba(255, 255, 255, 0.3)', 'rgba(255, 255, 255, 0.9)', 'rgba(255, 255, 255, 0.3)']
                ),
                transform: [
                    { scale: waveScale }
                ]
            };
        }

        return style;
    });
    
    return animatedStyle;
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
		const blockStyle = createBlockStyle(x, y, board);
		const blockPositionStyle = {
			position: "absolute",
			top: y * GRID_BLOCK_SIZE,
			left: x * GRID_BLOCK_SIZE,
		};

		blockElements.push(
			<Animated.View
				key={`av${x},${y}`}
				style={[styles.emptyBlock, blockPositionStyle as any, blockStyle]}
			>
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
		if (draggingPiece.value == null) {
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

	const animatedStyle = useAnimatedStyle(() => {
		runOnJS(updateLayout)();
		const active = possibleBoardDropSpots.value[y][x] == 1;
		if (active) {
			// use a smaller size droppable than the block so that detection does not overlap with other blocks.
			return {
				width: HITBOX_SIZE,
				height: HITBOX_SIZE,
			};
		} else {
			return {
				width: 0,
				height: 0,
			};
		}
	}, [props, possibleBoardDropSpots]);

	return (
		<Animated.View {...props} style={[style, animatedStyle]} {...otherProps}>
			{children}
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	emptyBlock: {
		width: GRID_BLOCK_SIZE,
		height: GRID_BLOCK_SIZE,
		margin: 0,
		borderWidth: 1,
		borderRadius: 0,
		position: "absolute",
		justifyContent: "center",
		alignItems: "center",
	},
	grid: {
		position: "relative",
		borderWidth: 3,
		borderRadius: 5,
		opacity: 1,
	},
	hitbox: {
		width: HITBOX_SIZE,
		height: HITBOX_SIZE,
	},
});
