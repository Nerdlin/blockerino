import { useGameSizes } from "@/constants/Board";
import { Hand } from "@/constants/Hand";
import { createFilledBlockStyle } from "@/constants/Piece";
import { SharedPoint, useDraggable } from "@mgcrea/react-native-dnd";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { SharedValue, runOnJS, useAnimatedStyle, useAnimatedReaction } from "react-native-reanimated";

interface HandProps {
	hand: SharedValue<Hand>;
	boardSize: number;
	onHandChange?: (newHand: Hand) => void;
}

function HandBlock({
	hand,
	i,
	x,
	y,
	GRID_BLOCK_SIZE,
}: {
	hand: SharedValue<Hand>;
	i: number;
	x: number;
	y: number;
	GRID_BLOCK_SIZE: number;
}) {
	const animatedStyle = useAnimatedStyle(() => {
		const piece = hand.value[i];
		if (piece == null) {
			return {
				opacity: 0,
			};
		}
		const pieceHeight = piece.matrix.length;
		const pieceWidth = piece.matrix[0].length;

		let style = {};
		if (x > pieceWidth - 1 || y > pieceHeight - 1 || piece.matrix[y][x] === 0) {
			style = {
				opacity: 0,
			};
		} else {
			style = {
				top: y * GRID_BLOCK_SIZE,
				left: x * GRID_BLOCK_SIZE,
				width: GRID_BLOCK_SIZE,
				height: GRID_BLOCK_SIZE,
				...createFilledBlockStyle(piece.color),
				opacity: 1,
			};
		}

		return style;
	});

	return (
		<Animated.View
			style={[
				styles.emptyBlock,
				{
					width: GRID_BLOCK_SIZE,
					height: GRID_BLOCK_SIZE,
				},
				animatedStyle,
			]}
		/>
	);
}

export default function HandPieces({ hand, boardSize, onHandChange }: HandProps) {
	const { GRID_BLOCK_SIZE, HAND_BLOCK_SIZE, DRAG_JUMP_LENGTH } = useGameSizes(boardSize);
	const handSize = hand.value.length;
	const handPieces = [];

	for (let i = 0; i < handSize; i++) {
		const pieceBlocks = [];
		for (let y = 0; y < 5; y++) {
			for (let x = 0; x < 5; x++) {
				pieceBlocks.push(
					<HandBlock
						key={`p${x},${y}`}
						hand={hand}
						i={i}
						x={x}
						y={y}
						GRID_BLOCK_SIZE={GRID_BLOCK_SIZE}
					/>
				);
			}
		}

		const id = String(i);

		const animatedStyle = (sleeping: boolean, dragging: boolean, acting: boolean, offset: SharedPoint, hand: Hand) => {
			"worklet";
			const piece = hand[i];
			if (piece == null) {
				return {
					position: 'absolute' as const,
					top: 0,
					left: 0,
					width: 0,
					height: 0,
					opacity: 0,
					transform: [
						{
							translateX: 0
						},
						{
							translateY: 0
						},
						{
							scale: HAND_BLOCK_SIZE / GRID_BLOCK_SIZE
						}
					]
				}
			}
			const zIndex = dragging ? 999 : acting ? 998 : 1;

			const pieceHeight = piece.matrix.length;
			const pieceWidth = piece.matrix[0].length;

			// Center the absolutely positioned element visually inside the slot when not dragging
			const topOffset = (HAND_BLOCK_SIZE * 5 - pieceHeight * GRID_BLOCK_SIZE) / 2;
			const leftOffset = (HAND_BLOCK_SIZE * 5 - pieceWidth * GRID_BLOCK_SIZE) / 2;

			const style = {
				position: 'absolute' as const,
				top: topOffset,
				left: leftOffset,
				width: pieceWidth * GRID_BLOCK_SIZE,
				height: pieceHeight * GRID_BLOCK_SIZE,
				opacity: 1,
				zIndex,
				transform: [
					{
						translateX:
							dragging || acting
								? offset.x.value
								: 0,
					},
					{
						translateY:
							dragging || acting
								? offset.y.value - (dragging ? DRAG_JUMP_LENGTH : 0)
								: 0,
					},
					{
						scale: dragging ? 1 : HAND_BLOCK_SIZE / GRID_BLOCK_SIZE
					},
				]
			};

			return style;
		};

		handPieces.push(
			<View key={"v" + i} style={[styles.piece, { width: HAND_BLOCK_SIZE * 5, height: HAND_BLOCK_SIZE * 5 }]}>
				<PieceDraggable
					id={id}
					key={`${i}`}
					createStyle={animatedStyle}
					hand={hand}
				>
					{pieceBlocks}
				</PieceDraggable>
			</View>
		);
	}

	const { width, height } = useWindowDimensions();
	const isMobile = width < 600 || height < 700;
	const isShortScreen = height < 700;

	return (
		<View
			style={[
				styles.hand,
				{
					maxWidth: HAND_BLOCK_SIZE * 5 * handSize,
					maxHeight: HAND_BLOCK_SIZE * 5,
					height: HAND_BLOCK_SIZE * 5,
					marginTop: isMobile ? (isShortScreen ? 36 : 30) : 45,
					flexWrap: 'nowrap',
					flex: 0
				}
			]}
		>
			{handPieces}
		</View>
	);
}

export function ReadOnlyHandPieces({ hand, boardSize, scale = 1 }: { hand: Hand; boardSize: number; scale?: number }) {
	const { HAND_BLOCK_SIZE } = useGameSizes(boardSize);
	const size = HAND_BLOCK_SIZE * scale;
	const blockSize = size;

	const handSize = hand ? hand.length : 0;
	const handPieces = [];

	for (let i = 0; i < handSize; i++) {
		const piece = hand[i];
		if (piece == null) {
			handPieces.push(
				<View key={"v" + i} style={[styles.piece, { width: size * 5, height: size * 5 }]} />
			);
			continue;
		}

		const pieceHeight = piece.matrix.length;
		const pieceWidth = piece.matrix[0].length;
		const pieceBlocks = [];

		for (let y = 0; y < pieceHeight; y++) {
			for (let x = 0; x < pieceWidth; x++) {
				if (piece.matrix[y][x] >= 1) {
					pieceBlocks.push(
						<View 
							key={`p${x},${y}`} 
							style={[
								styles.emptyBlock, 
								{
									top: y * blockSize,
									left: x * blockSize,
									width: blockSize,
									height: blockSize,
									...createFilledBlockStyle(piece.color, Math.max(1, Math.round(blockSize * 0.15))),
									opacity: 1,
									justifyContent: 'center',
									alignItems: 'center',
								}
							]} 
						/>
					);
				}
			}
		}

		handPieces.push(
			<View key={"v" + i} style={[styles.piece, { width: size * 5, height: size * 5 }]}>
				<View style={{
					width: pieceWidth * blockSize,
					height: pieceHeight * blockSize,
					position: 'relative'
				}}>
					{pieceBlocks}
				</View>
			</View>
		);
	}

	return (
		<View style={{ 
			maxWidth: size * 5 * handSize, 
			height: size * 5,
			marginTop: 5,
			alignSelf: 'center',
			flexDirection: 'row',
			flexWrap: 'nowrap',
			justifyContent: 'center',
			alignItems: 'center'
		}}>
			{handPieces}
		</View>
	);
}

interface PieceDraggableProps {
	children: any;
	id: string;
	createStyle: (sleeping: boolean, dragging: boolean, acting: boolean, offset: SharedPoint, hand: Hand) => object;
	hand: any;
}

function PieceDraggable({ children, id, createStyle, hand, ...otherProps }: PieceDraggableProps) {
	const { props, offset, state, setNodeLayout } = useDraggable({
		id,
	});

	const updateLayout = () => {
		setTimeout(() => {
			(setNodeLayout as any)(null);
		}, 50);
	}

	useAnimatedReaction(() => {
		return hand.value[Number(id)];
	}, (cur, prev) => {
		if (cur !== prev) {
			runOnJS(updateLayout)();
		}
	});

	const animatedStyle = useAnimatedStyle(() => {
		const isSleeping = state.value === "sleeping";
		const isActive = state.value === "dragging";
		const isActing = state.value === "acting";
		return createStyle(isSleeping, isActive, isActing, offset, hand.value);
	}, [state, hand, createStyle]);

	return (
		<Animated.View {...props} style={animatedStyle} {...otherProps}>
			{children}
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	emptyBlock: {
		margin: 0,
		borderWidth: 1,
		borderRadius: 0,
		position: 'absolute',
		justifyContent: 'center',
		alignItems: 'center',
	},
	hand: {
		justifyContent: 'center',
		alignItems: 'center',
		flexDirection: 'row',
		position: 'relative',
		marginTop: 40,
		flexWrap: 'wrap',
		alignSelf: 'center',
		flex: 1,
		zIndex: 20,
	},
	piece: {
		position: 'relative',
		justifyContent: 'center',
		alignItems: 'center'
	}
});
