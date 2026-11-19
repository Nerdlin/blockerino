import { isGemColor } from "@/constants/Levels";
import { SKIN_NEON, getSkinKindId, skinAppear, skinBlockShape, skinClear, skinCorners } from "@/constants/SkinFx";
import { textureOf } from "@/constants/SkinTextures";
import SkinTexture from "../SkinTexture";
import SkinnedBlock from "../SkinnedBlock";
import { OwnBoardFx, StaticBoardFx, useReducedFx } from "../SkinFx";
import { getSkinAnim } from "@/constants/SkinAnimations";

/** A gem cell of a level: a cut cyan stone turned on its corner. */
function gemBlockStyle(size: number): object {
	"worklet";
	return {
		backgroundColor: '#3FE6E0',
		borderWidth: Math.max(2, Math.round(size * 0.12)),
		borderTopColor: '#E8FFFE',
		borderLeftColor: '#B5FFFB',
		borderRightColor: '#1FA5A0',
		borderBottomColor: '#11706C',
		borderRadius: Math.round(size * 0.18),
		transform: [{ rotate: '45deg' }, { scale: 0.74 }],
		opacity: 1,
		boxShadow: '0 0 8px rgba(120,255,250,0.8)',
	};
}
import React from "react";
import {
	Board,
	BoardBlock,
	BoardBlockType,
	type ClearedLines,
	type PlacementPreview,
	forEachBoardBlock,
	PossibleBoardSpots,
	useGameSizes
} from "@/constants/Board";
import { Color, colorToHex } from "@/constants/Color";
import { Hand } from "@/constants/Hand";
import {
	createEmptyBlockStyle,
	createFilledBlockStyle,
	filledBlockBorderWidth,
	getPieceSkinColor,
} from "@/constants/Piece";
import { shopStateAtom } from "@/constants/Shop";
import { Theme, useTheme } from "@/constants/Theme";
import { useDroppable } from "@mgcrea/react-native-dnd";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { StyleSheet, Platform, View } from "react-native";
import Animated, {
	SharedValue,
	makeMutable,
	runOnJS,
	useAnimatedReaction,
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withTiming,
} from "react-native-reanimated";

// On native, Reanimated runs each animated style once on the JS thread (runtime kind 1) before the UI thread takes over.
// On web there is no UI thread: every run is on the JS thread, so this must stay false there or styles never update.
const SKIPS_JS_FIRST_RUN = Platform.OS !== "web";
function isJsFirstRun() {
	"worklet";
	return SKIPS_JS_FIRST_RUN && (globalThis as { __RUNTIME_KIND?: number }).__RUNTIME_KIND === 1;
}

interface BlockGridProps {
	board: SharedValue<Board>;
	placementPreview: SharedValue<PlacementPreview | null>;
	lineClear: SharedValue<ClearedLines | null>;
	possibleBoardDropSpots: SharedValue<PossibleBoardSpots>;
	hand: SharedValue<Hand>;
	draggingPiece: SharedValue<number | null>;
	/** The run's combo; the combo effect of a chest skin grows with it. */
	combo?: SharedValue<number>;
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
	cell: SharedValue<GridCell>;
}

function SparkParticle({ sparkProgress, index, x, y, gridBlockSize, cell }: SparkParticleProps) {
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

		const block = cell.value;
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

type GridCell = BoardBlock & { clearVersion: number };

interface GridBlockProps {
	x: number;
	y: number;
	/** This cell of the board, mirrored by the grid only when it changes (see BlockGridView). */
	cell: SharedValue<GridCell>;
	gridBlockSize: number;
	currentTheme: Theme;
	pieceSkinId: string;
	showDebris: boolean;
	/** Whether the cell was empty when it was first drawn. */
	startsEmpty: boolean;
	/** The colour of the block it held when it went live. */
	startColor: Color;
}

// Reanimated keeps the last value of a style key that an animated style stops returning (on Android), so every state
// of a cell sets these again: otherwise a neon glow, a wave scale or an appear transform stays on an emptied cell.
const CELL_RESET = Platform.OS === "web"
	? { transform: [], zIndex: 0, boxShadow: "none" }
	: { transform: [], zIndex: 0, boxShadow: [] as never[] };

function CellDebris({ x, y, cell, gridBlockSize, pieceSkinId, startColor }: Pick<GridBlockProps, "x" | "y" | "cell" | "gridBlockSize" | "pieceSkinId" | "startColor">) {
	const progress = useSharedValue(0);
	const color = useSharedValue(startColor);
	const skinKind = getSkinKindId(pieceSkinId);
	// eslint-disable-next-line react-hooks/rules-of-hooks -- fixed per platform
	const sparkProgress = PARTICLE_CONFIGS.length > 0 ? useSharedValue(0) : null;
	const seed = (x * 7919 + y * 104729 + 31) % 100003;
	const angle = (seed % 628) / 100;
	const distance = 50 + (seed % 100);
	const dx = Math.cos(angle) * distance;
	const dy = Math.sin(angle) * distance;
	const rotation = ((seed * 7) % 720) - 360;

	useAnimatedReaction(() => cell.value.clearVersion, (current, previous) => {
		if (current === (previous ?? 0)) return;
		color.value = cell.value.color;
		progress.value = 0;
		progress.value = withTiming(1, { duration: 600 });
		if (sparkProgress) {
			sparkProgress.value = 0;
			sparkProgress.value = withTiming(1, { duration: 550 });
		}
	});

	const box = useAnimatedStyle(() => {
		const fill = isJsFirstRun() ? startColor : color.value;
		return {
			...createFilledBlockStyle(fill, 7, pieceSkinId),
			...skinBlockShape(skinKind, gridBlockSize, colorToHex(getPieceSkinColor(fill, pieceSkinId))),
		};
	});
	const motion = useAnimatedStyle(() => {
		if (isJsFirstRun()) return { opacity: 0 };
		const t = progress.value;
		if (t <= 0 || t >= 1 || cell.value.blockType !== BoardBlockType.EMPTY) return { opacity: 0 };
		return skinClear(skinKind, t, gridBlockSize, dx, dy, rotation);
	});

	return (
		<>
			<Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { width: gridBlockSize, height: gridBlockSize, zIndex: 20 }, box, motion]} />
			{PARTICLE_CONFIGS.map((_, index) => (
				<SparkParticle key={index} sparkProgress={sparkProgress!} index={index} x={x} y={y} gridBlockSize={gridBlockSize} cell={cell} />
			))}
		</>
	);
}

function CellNeonGlow({ cell, gridBlockSize }: Pick<GridBlockProps, "cell" | "gridBlockSize">) {
	const opacity = useSharedValue(0);
	const color = useSharedValue("#FFFFFF");
	useAnimatedReaction(() => cell.value.clearVersion, (current, previous) => {
		if (current === (previous ?? 0)) return;
		color.value = colorToHex(cell.value.color);
		opacity.value = 1;
		opacity.value = withTiming(0, { duration: 700 });
	});
	const glow = useAnimatedStyle(() => {
		if (isJsFirstRun()) return {};
		const hex = color.value;
		const rgba = `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, 0.85)`;
		return { boxShadow: `0 0 ${Math.round(gridBlockSize * 0.3)}px ${rgba}` };
	});
	const fade = useAnimatedStyle(() => ({ opacity: isJsFirstRun() || cell.value.blockType !== BoardBlockType.EMPTY ? 0 : opacity.value }));
	return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, glow, fade]} />;
}

const GridBlock = React.memo(function GridBlock({ x, y, cell, gridBlockSize, currentTheme, pieceSkinId, showDebris, startsEmpty, startColor }: GridBlockProps) {
	const appear = useSharedValue(1);
	const skinKind = getSkinKindId(pieceSkinId);

	useAnimatedReaction(() => cell.value.blockType, (current, previous) => {
		if (current === BoardBlockType.FILLED && previous === BoardBlockType.EMPTY) {
			appear.value = 0;
			appear.value = withTiming(1, { duration: 280 });
		}
	});

	const staticStyle = useAnimatedStyle(() => {
		// Reanimated runs a style once on the JS thread (runtime kind 1) for the first frame; reading the board there would copy it
		// across runtimes for every cell, so that run draws the cell from its props and the UI thread takes over.
		if (isJsFirstRun()) {
			if (!startsEmpty && isGemColor(startColor)) return { ...CELL_RESET, ...gemBlockStyle(gridBlockSize) };
			return startsEmpty ? { ...CELL_RESET, ...createEmptyBlockStyle(currentTheme.emptyBlockBorder, 0) } : { ...CELL_RESET, ...createFilledBlockStyle(startColor, 7, pieceSkinId), ...skinBlockShape(skinKind, gridBlockSize, colorToHex(getPieceSkinColor(startColor, pieceSkinId))), opacity: 1, transform: [] };
		}
		const block = cell.value;

		if (block.blockType === BoardBlockType.EMPTY) {
			return { ...CELL_RESET, ...createEmptyBlockStyle(currentTheme.emptyBlockBorder, 0) };
		}

		if (isGemColor(block.color)) {
			return { ...CELL_RESET, ...gemBlockStyle(gridBlockSize) };
		}
		return {
			...CELL_RESET,
			...createFilledBlockStyle(block.color, 7, pieceSkinId),
			...skinBlockShape(skinKind, gridBlockSize, colorToHex(getPieceSkinColor(block.color, pieceSkinId))),
			opacity: 1,
			...(appear.value < 1 ? skinAppear(skinKind, appear.value, gridBlockSize) : {}),
		};
	});

	// the skin's surface over a filled block (stone face, crystal facet, lava core, neon hollow, drop shine). It sits in a
	// frame with the block's own border width, so its insets count from the same inner edge as in the hand and the shop,
	// and it follows the block while it appears. The surface itself does not depend on the block's color.
	const decorFrameStyle = useAnimatedStyle((): any => {
		if (skinKind === 0 || isJsFirstRun()) return { opacity: 0 };
		const block = cell.value;
		if (block.blockType !== BoardBlockType.FILLED || isGemColor(block.color)) return { opacity: 0, transform: [] };
		if (appear.value < 1) {
			const a = skinAppear(skinKind, appear.value, gridBlockSize) as { opacity?: number; transform?: any[] };
			return { opacity: a.opacity ?? 1, transform: a.transform ?? [] };
		}
		return { opacity: 1, transform: [] };
	});
	const decor = skinKind !== 0 && textureOf(pieceSkinId) !== null;
	const decorFrame = { position: 'absolute' as const, left: 0, top: 0, width: gridBlockSize, height: gridBlockSize, borderWidth: filledBlockBorderWidth(7, pieceSkinId), borderColor: 'transparent', overflow: 'hidden' as const, ...skinCorners(skinKind, gridBlockSize) };

	return (
		<>
			<Animated.View style={[staticStyle, { width: gridBlockSize, height: gridBlockSize, justifyContent: 'center', alignItems: 'center' }]} />
			{decor && (
				<Animated.View pointerEvents="none" style={[decorFrame, decorFrameStyle]}>
					<SkinTexture skinId={pieceSkinId} />
				</Animated.View>
			)}
			{(skinKind & 15) === SKIN_NEON && <CellNeonGlow cell={cell} gridBlockSize={gridBlockSize} />}
			{showDebris && <CellDebris x={x} y={y} cell={cell} gridBlockSize={gridBlockSize} pieceSkinId={pieceSkinId} startColor={startColor} />}
		</>
	);
});

// The overlays below are plain Views animated by opacity and transform. They used to be react-native-svg paths whose
// "d" changed while a piece was dragged and when a line cleared; on a phone each of those updates re-drew an SVG bitmap
// on the main thread (measured on a Galaxy: dragging and clearing a line cost about twice as many slow frames).
function ClearFlashBar({ axis, k, lineClear, brightness, size, n }: { axis: "row" | "column"; k: number; lineClear: SharedValue<ClearedLines | null>; brightness: SharedValue<number>; size: number; n: number }) {
	const style = useAnimatedStyle(() => {
		if (isJsFirstRun()) return { opacity: 0 };
		const cleared = lineClear.value;
		const hit = cleared != null && (axis === "row" ? cleared.rows.includes(k) : cleared.columns.includes(k));
		return { opacity: hit ? brightness.value : 0 };
	});
	const length = n * size;
	return <Animated.View pointerEvents="none" style={[styles.overlayBar, axis === "row" ? { left: 0, top: k * size, width: length, height: size } : { left: k * size, top: 0, width: size, height: length }, style]} />;
}

function ClearFlash({ lineClear, size, n }: { lineClear: SharedValue<ClearedLines | null>; size: number; n: number }) {
	const brightness = useSharedValue(0);
	useAnimatedReaction(() => lineClear.value, (cleared) => {
		if (!cleared) return;
		brightness.value = withSequence(withTiming(0.82, { duration: 75 }), withTiming(0, { duration: 230 }));
	});
	const bars: React.ReactNode[] = [];
	for (let k = 0; k < n; k++) {
		bars.push(<ClearFlashBar key={`r${k}`} axis="row" k={k} lineClear={lineClear} brightness={brightness} size={size} n={n} />);
		bars.push(<ClearFlashBar key={`c${k}`} axis="column" k={k} lineClear={lineClear} brightness={brightness} size={size} n={n} />);
	}
	return <View pointerEvents="none" style={StyleSheet.absoluteFill}>{bars}</View>;
}

function OpeningSweep({ size, n }: { size: number; n: number }) {
	const progress = useSharedValue(0);
	useEffect(() => {
		progress.value = withTiming(1, { duration: 420 });
	}, [progress]);
	const band = useAnimatedStyle(() => {
		if (isJsFirstRun()) return { opacity: 0 };
		const t = progress.value;
		return { opacity: 0.45 * t * (1 - t), transform: [{ translateY: (n - (n + 2) * t) * size }] };
	});
	return <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip]}>
		<Animated.View style={[{ height: 2 * size, backgroundColor: "white" }, band]} />
	</View>;
}

function PreviewCell({ column, row, hand, draggingPiece, size }: { column: number; row: number; hand: SharedValue<Hand>; draggingPiece: SharedValue<number | null>; size: number }) {
	// the shape of the dragged piece changes only when a drag starts or another piece is picked up
	const style = useAnimatedStyle(() => {
		if (isJsFirstRun()) return { opacity: 0 };
		const index = draggingPiece.value;
		const matrix = index == null ? undefined : hand.value[index]?.matrix;
		return { opacity: matrix != null && matrix[row] != null && matrix[row][column] >= 1 ? 1 : 0 };
	});
	return <Animated.View pointerEvents="none" style={[styles.previewCell, { left: column * size + 1, top: row * size + 1, width: size - 2, height: size - 2 }, style]} />;
}

function PreviewLine({ axis, k, placementPreview, size, n }: { axis: "row" | "column"; k: number; placementPreview: SharedValue<PlacementPreview | null>; size: number; n: number }) {
	const style = useAnimatedStyle(() => {
		if (isJsFirstRun()) return { opacity: 0 };
		const preview = placementPreview.value;
		const hit = preview != null && (axis === "row" ? preview.rows.includes(k) : preview.columns.includes(k));
		return { opacity: hit ? 1 : 0 };
	});
	const length = n * size - 2;
	return <Animated.View pointerEvents="none" style={[styles.previewLine, axis === "row" ? { left: 1, top: k * size + 1, width: length, height: size - 2 } : { left: k * size + 1, top: 1, width: size - 2, height: length }, style]} />;
}

function LandingPreview({ placementPreview, hand, draggingPiece, size, n }: Pick<BlockGridProps, "placementPreview" | "hand" | "draggingPiece"> & { size: number; n: number }) {
	const position = useAnimatedStyle(() => {
		const preview = placementPreview.value;
		return {
			opacity: preview ? 1 : 0,
			transform: [{ translateX: (preview?.x ?? 0) * size }, { translateY: (preview?.y ?? 0) * size }],
		};
	});
	const cells: React.ReactNode[] = [];
	for (let row = 0; row < 5; row++) {
		for (let column = 0; column < 5; column++) cells.push(<PreviewCell key={`${column},${row}`} column={column} row={row} hand={hand} draggingPiece={draggingPiece} size={size} />);
	}
	const lines: React.ReactNode[] = [];
	for (let k = 0; k < n; k++) {
		lines.push(<PreviewLine key={`r${k}`} axis="row" k={k} placementPreview={placementPreview} size={size} n={n} />);
		lines.push(<PreviewLine key={`c${k}`} axis="column" k={k} placementPreview={placementPreview} size={size} n={n} />);
	}
	return (
		<View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 10, overflow: "hidden" }]}>
			<Animated.View testID="landing-preview" style={[StyleSheet.absoluteFill, position]}>{cells}</Animated.View>
			<View testID="landing-preview-lines" style={StyleSheet.absoluteFill}>{lines}</View>
		</View>
	);
}

function BlockGridView({
	board,
	placementPreview,
	lineClear,
	possibleBoardDropSpots,
	draggingPiece,
	hand,
	combo
}: BlockGridProps) {
	// Opening a game used to block for a second or more while every cell set up its animations. The grid now shows
	// plain cells at once and swaps in the animated ones a couple of rows per frame, under the opening light sweep.
	// Reading a shared value on the JS thread is a synchronous trip to the UI runtime that copies the whole board, so
	// a render reads it once; reading it once per cell took about half a second per render on a phone.
	const snapshot = React.useMemo(() => board.value, [board]);
	const boardLength = snapshot.length;
	// Only cells touched by a committed move need to update their styles.
	const cells = React.useMemo(() => snapshot.flat().map((block) => makeMutable<GridCell>({ ...block, clearVersion: 0 })),
		// eslint-disable-next-line react-hooks/exhaustive-deps -- the cells follow the board through the reaction below
		[board, boardLength]);
	useAnimatedReaction(() => board.value, (current, previous) => {
		const cleared = previous ? lineClear.value : null;
		const n = current.length;
		for (let y = 0; y < n; y++) {
			for (let x = 0; x < n; x++) {
				const cell = cells[y * n + x];
				if (!cell) continue;
				const next = current[y][x];
				const old = cell.value;
				const didClear = cleared?.rows.includes(y) || cleared?.columns.includes(x);
				if (didClear || old.blockType !== next.blockType || old.color.r !== next.color.r || old.color.g !== next.color.g || old.color.b !== next.color.b) {
					cell.value = { ...next, clearVersion: old.clearVersion + (didClear ? 1 : 0) };
				}
			}
		}
	}, [cells]);
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
	// the skin's animation layer joins once every row is live, so it does not slow the opening of a game
	const skinAnim = getSkinAnim(pieceSkinId);
	const reducedFx = useReducedFx();
	const showDebris = Platform.OS !== "android" || skinAnim == null;

	forEachBoardBlock(snapshot, (block, x, y) => {
		const blockPositionStyle = {
			position: "absolute" as const,
			top: y * GRID_BLOCK_SIZE,
			left: x * GRID_BLOCK_SIZE,
			width: GRID_BLOCK_SIZE,
			height: GRID_BLOCK_SIZE,
		};

		const live = y < liveRows;
		const plainStyle = live ? null : (block.blockType === BoardBlockType.EMPTY ? createEmptyBlockStyle(currentTheme.emptyBlockBorder, 0) : isGemColor(block.color) ? gemBlockStyle(GRID_BLOCK_SIZE) : createFilledBlockStyle(block.color, 7, pieceSkinId));
		blockElements.push(
			<Animated.View key={`${x},${y}`} style={blockPositionStyle}>
				{!live ? <View style={[plainStyle, { width: GRID_BLOCK_SIZE, height: GRID_BLOCK_SIZE }]} /> : <GridBlock
					x={x}
					y={y}
					cell={cells[y * boardLength + x]}
					gridBlockSize={GRID_BLOCK_SIZE}
					currentTheme={currentTheme}
					pieceSkinId={pieceSkinId}
					showDebris={showDebris}
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

	// One 1px line between every two rows and columns, at whole pixels.
	const gridLines: any[] = [];
	for (let i = 1; i < boardLength; i++) {
		gridLines.push(
			<View key={`v${i}`} style={{ position: "absolute", pointerEvents: "none", left: i * GRID_BLOCK_SIZE, top: 0, width: 1, height: GRID_BLOCK_SIZE * boardLength, backgroundColor: currentTheme.emptyBlockBorder }} />,
			<View key={`h${i}`} style={{ position: "absolute", pointerEvents: "none", top: i * GRID_BLOCK_SIZE, left: 0, height: 1, width: GRID_BLOCK_SIZE * boardLength, backgroundColor: currentTheme.emptyBlockBorder }} />,
		);
	}

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
			testID="board-grid"
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
			{gridLines}
			{blockElements}
			<OpeningSweep size={GRID_BLOCK_SIZE} n={boardLength} />
			<ClearFlash lineClear={lineClear} size={GRID_BLOCK_SIZE} n={boardLength} />
			<LandingPreview placementPreview={placementPreview} hand={hand} draggingPiece={draggingPiece} size={GRID_BLOCK_SIZE} n={boardLength} />
			{skinAnim && liveRows >= boardLength && (
				<OwnBoardFx board={board} lineClear={lineClear} combo={combo} skinId={pieceSkinId} anim={skinAnim} blockSize={GRID_BLOCK_SIZE} reduced={reducedFx} />
			)}
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
		if (previousActive !== null && active !== previousActive) {
			runOnJS(updateLayout)();
		}
	});

	const animatedStyle = useAnimatedStyle(() => {
		// nothing can be dropped before a drag starts, so the first (JS thread) run needs no trip for the drop spots
		if (isJsFirstRun()) return { width: 0, height: 0 };
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
	overlayBar: { position: "absolute", backgroundColor: "white" },
	previewCell: { position: "absolute", backgroundColor: "rgba(255,255,255,0.24)", borderWidth: 1, borderColor: "rgba(255,255,255,0.75)" },
	previewLine: { position: "absolute", borderWidth: 2, borderColor: "#FFE69E" },
	clip: { overflow: "hidden" },
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
	/** The board owner's piece skin (a Versus opponent's); the viewer's own when not given. */
	pieceSkinId?: string;
}

export function ReadOnlyBlockGrid({ board, gridBlockSize, hoverIndex, hoverX, hoverY, hand, pieceSkinId: ownerSkin }: ReadOnlyBlockGridProps) {
	const blockElements: any[] = [];
	const boardLength = board.length;
	const { currentTheme } = useTheme();
	const mySkin = useAtomValue(shopStateAtom).equipped.piece_skin;
	const pieceSkinId = ownerSkin ?? mySkin;
	const skinAnim = getSkinAnim(pieceSkinId);

	// Calculate which cells are covered by the opponent's dragging piece
	const hoverCells = new Set<string>();
	const hoverIdx: number[] = [];
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
							hoverIdx.push(by * boardLength + bx);
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

		const isFilledOrHoveredBreak = block.blockType === BoardBlockType.FILLED || block.blockType === BoardBlockType.HOVERED_BREAK_FILLED;
		const isHoverCell = hoverCells.has(`${x},${y}`);
		const blockBorder = Math.max(1, Math.round(gridBlockSize * 0.15));

		// the owner's own skin: its colours, block shape and picture (the opponent's, in Versus)
		if (isFilledOrHoveredBreak) {
			blockElements.push(<SkinnedBlock key={`${x},${y}`} color={block.color} size={gridBlockSize} skinId={pieceSkinId} borderWidth={blockBorder} style={blockPositionStyle} />);
			return;
		}
		if (isHoverCell) {
			// ghost preview of the opponent's drag
			blockElements.push(<SkinnedBlock key={`${x},${y}`} color={hoverColor} size={gridBlockSize} skinId={pieceSkinId} borderWidth={blockBorder} style={[blockPositionStyle, { opacity: 0.35 }]} />);
			return;
		}
		blockElements.push(
			<View key={`${x},${y}`} style={[blockPositionStyle, createEmptyBlockStyle(currentTheme.emptyBlockBorder), { width: gridBlockSize, height: gridBlockSize, justifyContent: 'center', alignItems: 'center' }]} />
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
			{skinAnim && (
				<StaticBoardFx board={board} skinId={pieceSkinId} blockSize={gridBlockSize} hoverCells={hoverIdx} hoverHex={colorToHex(getPieceSkinColor(hoverColor, pieceSkinId))} />
			)}
		</View>
	);
}

// Memoised: its props are shared values that never change identity, and a re-render of every cell (or hand block)
// cost the JS thread up to a second each time the game re-rendered for a score popup.
const BlockGrid = React.memo(BlockGridView);
export default BlockGrid;
