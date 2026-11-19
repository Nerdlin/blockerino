import React from "react";
import { useGameSizes } from "@/constants/Board";
import { Hand } from "@/constants/Hand";
import { bombPiecesData, createFilledBlockStyle, getPieceSkinColor, piecesData } from "@/constants/Piece";
import SkinnedBlock from "../SkinnedBlock";
import { colorToHex, type Color } from "@/constants/Color";
import { getSkinKindId, skinBlockShape, skinCorners } from "@/constants/SkinFx";
import { textureOf } from "@/constants/SkinTextures";
import SkinTexture from "../SkinTexture";
import { SkinTrail, useReducedFx } from "../SkinFx";
import { getSkinAnim } from "@/constants/SkinAnimations";
import { shopStateAtom } from "@/constants/Shop";
import { SharedPoint, useDraggable } from "@mgcrea/react-native-dnd";
import { useAtomValue } from "jotai";
import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { SharedValue, runOnJS, useAnimatedStyle, useAnimatedReaction, useDerivedValue } from "react-native-reanimated";

const NATIVE = Platform.OS !== "web";
function isJsFirstRun() {
	"worklet";
	return NATIVE && (globalThis as { __RUNTIME_KIND?: number }).__RUNTIME_KIND === 1;
}

type PieceCells = { color: Color; positions: { x: number; y: number }[] };
const MAX_CELLS = Math.max(...[...piecesData, ...bombPiecesData].map(({ matrix }) =>
	matrix.reduce((count, row) => count + row.filter((cell) => cell >= 1).length, 0)
));

function pieceCells(hand: Hand): (PieceCells | null)[] {
	"worklet";
	return hand.map((piece) => {
		if (!piece) return null;
		const positions: PieceCells["positions"] = [];
		for (let y = 0; y < piece.matrix.length; y++) {
			for (let x = 0; x < piece.matrix[y].length; x++) {
				if (piece.matrix[y][x] >= 1) positions.push({ x, y });
			}
		}
		return { color: piece.color, positions };
	});
}

interface HandProps {
	hand: SharedValue<Hand>;
	boardSize: number;
	onHandChange?: (newHand: Hand) => void;
}

function HandBlock({ cells, initialPiece, slot, index, size, pieceSkinId }: {
	cells: SharedValue<(PieceCells | null)[]>;
	initialPiece: PieceCells | null;
	slot: number;
	index: number;
	size: number;
	pieceSkinId: string;
}) {
	const skinKind = getSkinKindId(pieceSkinId);
	const animatedStyle = useAnimatedStyle(() => {
		const piece = isJsFirstRun() ? initialPiece : cells.value[slot];
		const position = piece?.positions[index];
		if (!piece || !position) return { opacity: 0 };
		return {
			...createFilledBlockStyle(piece.color, 7, pieceSkinId),
			...skinBlockShape(skinKind, size, colorToHex(getPieceSkinColor(piece.color, pieceSkinId))),
			top: position.y * size,
			left: position.x * size,
			opacity: 1,
		};
	});

	return (
		<Animated.View style={[styles.emptyBlock, { width: size, height: size }, animatedStyle]}>
			{skinKind !== 0 && textureOf(pieceSkinId) && (
				<View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "hidden" }, skinCorners(skinKind, size)]}>
					<SkinTexture skinId={pieceSkinId} />
				</View>
			)}
		</Animated.View>
	);
}

function HandPiecesView({ hand, boardSize }: HandProps) {
	const { GRID_BLOCK_SIZE, HAND_BLOCK_SIZE, HAND_GAP, DRAG_JUMP_LENGTH } = useGameSizes(boardSize);
	const pieceSkinId = useAtomValue(shopStateAtom).equipped.piece_skin;
	const skinAnim = getSkinAnim(pieceSkinId);
	const reducedFx = useReducedFx();
	const startingHand = hand.value;
	const startingCells = pieceCells(startingHand);
	const liveCells = useDerivedValue(() => isJsFirstRun() ? startingCells : pieceCells(hand.value));
	const handSize = startingHand.length;
	const handPieces = [];

	for (let i = 0; i < handSize; i++) {
		const initialPiece = startingCells[i];
		const capacity = Math.max(MAX_CELLS, initialPiece?.positions.length ?? 0);
		const pieceBlocks = Array.from({ length: capacity }, (_, index) => (
			<HandBlock
				key={index}
				cells={liveCells}
				initialPiece={initialPiece}
				slot={i}
				index={index}
				size={GRID_BLOCK_SIZE}
				pieceSkinId={pieceSkinId}
			/>
		));

		const id = String(i);

		const animatedStyle = (dragging: boolean, acting: boolean, offset: SharedPoint, hand: Hand) => {
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
			<View key={"v" + i} testID={`hand-slot-${i}`} style={[styles.piece, { width: HAND_BLOCK_SIZE * 5, height: HAND_BLOCK_SIZE * 5 }]}>
				<PieceDraggable
					id={id}
					key={`${i}`}
					createStyle={animatedStyle}
					hand={hand}
					startingHand={startingHand}
					trail={skinAnim && !reducedFx ? { anim: skinAnim, skinId: pieceSkinId, hand, index: i, slotSize: HAND_BLOCK_SIZE * 5, jump: DRAG_JUMP_LENGTH, gridSize: GRID_BLOCK_SIZE } : undefined}
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
					marginTop: HAND_GAP ?? (isMobile ? (isShortScreen ? 36 : 30) : 45),
					flexWrap: 'nowrap',
					flex: 0
				}
			]}
		>
			{handPieces}
		</View>
	);
}

/** Another player's hand, drawn in that player's skin (pieceSkinId); without one it falls back to this player's own. */
export function ReadOnlyHandPieces({ hand, boardSize, scale = 1, pieceSkinId: ownerSkin }: { hand: Hand; boardSize: number; scale?: number; pieceSkinId?: string }) {
	const { HAND_BLOCK_SIZE } = useGameSizes(boardSize);
	const mySkin = useAtomValue(shopStateAtom).equipped.piece_skin;
	const pieceSkinId = ownerSkin ?? mySkin;
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
						<SkinnedBlock
							key={`p${x},${y}`}
							color={piece.color}
							size={blockSize}
							skinId={pieceSkinId}
							style={[styles.emptyBlock, { top: y * blockSize, left: x * blockSize, opacity: 1 }]}
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
	createStyle: (dragging: boolean, acting: boolean, offset: SharedPoint, hand: Hand) => object;
	hand: SharedValue<Hand>;
	startingHand: Hand;
	/** The skin's drag trail, left behind this piece while it is dragged. */
	trail?: Omit<React.ComponentProps<typeof SkinTrail>, "offset" | "state">;
}

function PieceDraggable({ children, id, createStyle, hand, startingHand, trail, ...otherProps }: PieceDraggableProps) {
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
		if (isJsFirstRun()) return createStyle(false, false, offset, startingHand);
		const phase = state.value;
		return createStyle(phase === "dragging", phase === "acting", offset, hand.value);
	}, [state, hand, createStyle]);

	return (
		<>
			<Animated.View {...props} style={animatedStyle} {...otherProps}>
				{children}
			</Animated.View>
			{trail && <SkinTrail {...trail} offset={offset} state={state} />}
		</>
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

// Memoised: its props are shared values that never change identity, and a re-render of every cell (or hand block)
// cost the JS thread up to a second each time the game re-rendered for a score popup.
const HandPieces = React.memo(HandPiecesView, (prev, next) => prev.hand === next.hand && prev.boardSize === next.boardSize);
export default HandPieces;
