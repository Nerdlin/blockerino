import { Chess } from "chess.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
	Easing,
	FadeIn,
	FadeOut,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSequence,
	withTiming,
	ZoomIn,
	ZoomOut,
} from "react-native-reanimated";
import { useTheme } from "@/constants/Theme";
import { BotLook } from "@/constants/chess/BotSprites";
import { TrackedPiece, livePieces, trackPieces } from "@/constants/chess/PieceTracker";
import { CHESS_BOARD_COLORS, CHESS_PIECE_COLORS, ExtraGameCosmetics } from "../cosmetics";
import { styles as gameStyles } from "../styles";
import { BotAvatar } from "./BotAvatar";

export const CHESS_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
export const CHESS_RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];
export const UNICODE_PIECES: Record<string, string> = {
	wp: "♙", wn: "♘", wb: "♗", wr: "♖", wq: "♕", wk: "♔",
	bp: "♟", bn: "♞", bb: "♝", br: "♜", bq: "♛", bk: "♚",
};

const BOARD_BORDER = 4;
const MOVE_MS = 230;

export function getChessBoardColors(board: ExtraGameCosmetics["chessBoard"], dark: boolean) {
	const colors = CHESS_BOARD_COLORS[board] ?? CHESS_BOARD_COLORS.slate;
	return dark ? colors.dark : colors.light;
}

/** The square of the king that is in check, or null. */
export function checkedKingSquare(fen: string): string | null {
	const chess = new Chess(fen);
	if (!chess.inCheck()) return null;
	for (const row of chess.board()) {
		for (const piece of row) {
			if (piece && piece.type === "k" && piece.color === chess.turn()) return piece.square;
		}
	}
	return null;
}

/**
 * The pieces to draw, with identities that survive moves. When the move list does not lead to the position (a game
 * restored from a bare FEN), the pieces are read from the position instead and simply jump rather than slide.
 */
export function piecesFor(fen: string, moves: readonly string[]): (TrackedPiece & { square: string })[] {
	const board = new Chess(fen).board().flat().filter((piece) => piece !== null);
	const wanted = board.map((piece) => `${piece!.color}${piece!.type}@${piece!.square}`).sort().join();
	try {
		const tracked = livePieces(trackPieces(moves));
		if (tracked.map((piece) => `${piece.color}${piece.type}@${piece.square}`).sort().join() === wanted) return tracked;
	} catch {}
	const counts: Record<string, number> = {};
	return board.map((piece) => {
		const prefix = `${piece!.color}${piece!.type}`;
		counts[prefix] = (counts[prefix] ?? 0) + 1;
		return { id: `${prefix}${counts[prefix]}`, type: piece!.type, color: piece!.color, square: piece!.square };
	});
}

function AnimatedPiece({
	x,
	y,
	size,
	glyph,
	color,
	heavy,
	settled,
}: {
	x: number;
	y: number;
	size: number;
	glyph: string;
	color: string;
	heavy: boolean;
	/** False while the board is first drawn, so the opening position does not fly in. */
	settled: boolean;
}) {
	const left = useSharedValue(x);
	const top = useSharedValue(y);
	const lift = useSharedValue(0);
	const first = useRef(true);
	useEffect(() => {
		if (first.current) {
			first.current = false;
			left.value = x;
			top.value = y;
			return;
		}
		if (left.value === x && top.value === y) return;
		// the moving piece rises a little while it travels, so it reads as picked up and put down
		lift.value = withSequence(withTiming(1, { duration: MOVE_MS * 0.4 }), withTiming(0, { duration: MOVE_MS * 0.6 }));
		left.value = withTiming(x, { duration: MOVE_MS, easing: Easing.out(Easing.cubic) });
		top.value = withTiming(y, { duration: MOVE_MS, easing: Easing.out(Easing.cubic) });
	}, [x, y, left, top, lift]);
	const style = useAnimatedStyle(() => ({
		left: left.value,
		top: top.value,
		zIndex: lift.value > 0 ? 5 : 1,
		transform: [{ scale: 1 + lift.value * 0.16 }],
	}));
	return (
		<Animated.View
			pointerEvents="none"
			entering={settled ? FadeIn.duration(180) : undefined}
			exiting={ZoomOut.duration(200)}
			style={[local.piece, { width: size, height: size }, style]}
		>
			<Text style={[gameStyles.chessPiece, heavy && gameStyles.chessPieceClub, { color }]}>{glyph}</Text>
		</Animated.View>
	);
}

function CheckGlow({ x, y, size }: { x: number; y: number; size: number }) {
	const glow = useSharedValue(0.25);
	useEffect(() => {
		glow.value = withRepeat(withSequence(withTiming(0.8, { duration: 500 }), withTiming(0.25, { duration: 500 })), -1, false);
	}, [glow]);
	const style = useAnimatedStyle(() => ({ opacity: glow.value }));
	return <Animated.View pointerEvents="none" style={[{ position: "absolute", left: x, top: y, width: size, height: size, backgroundColor: "#F87171" }, style]} />;
}

export function ChessBoard({
	fen,
	moves,
	flipped,
	selected,
	legalTargets,
	lastMove,
	hint,
	cosmetics,
	onPressSquare,
}: {
	fen: string;
	/** The moves (SAN) that lead to `fen`, so the pieces can slide from where they were. */
	moves: readonly string[];
	flipped: boolean;
	selected: string | null;
	legalTargets: string[];
	lastMove: { from: string; to: string } | null;
	hint: { from: string; to: string } | null;
	cosmetics: ExtraGameCosmetics;
	onPressSquare: (square: string) => void;
}) {
	const ranks = flipped ? [...CHESS_RANKS].reverse() : CHESS_RANKS;
	const files = flipped ? [...CHESS_FILES].reverse() : CHESS_FILES;
	const kingInCheck = checkedKingSquare(fen);
	const palette = CHESS_PIECE_COLORS[cosmetics.chessPieces];
	const [width, setWidth] = useState(336);
	const [settled, setSettled] = useState(false);
	useEffect(() => {
		const timer = setTimeout(() => setSettled(true), 400);
		return () => clearTimeout(timer);
	}, []);
	const cell = Math.max(1, (width - BOARD_BORDER * 2) / 8);
	const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
	const pieces = useMemo(() => piecesFor(fen, moves), [fen, moves]);
	const at = (square: string) => ({ x: files.indexOf(square[0]) * cell, y: ranks.indexOf(square[1]) * cell });

	return (
		<View style={gameStyles.chessBoard} onLayout={onLayout}>
			{ranks.map((rank) =>
				files.map((file) => {
					const square = `${file}${rank}`;
					const dark = (CHESS_FILES.indexOf(file) + Number(rank)) % 2 === 0;
					const marked = lastMove && (lastMove.from === square || lastMove.to === square);
					return (
						<Pressable
							key={square}
							testID={`chess-sq-${square}`}
							accessibilityLabel={square}
							onPress={() => onPressSquare(square)}
							style={[
								gameStyles.chessCell,
								{
									backgroundColor:
										selected === square ? "#FACC15"
										: hint?.from === square ? "#38BDF8"
										: hint?.to === square ? "#4ADE80"
										: getChessBoardColors(cosmetics.chessBoard, dark),
								},
							]}
						>
							{marked && selected !== square ? (
								<Animated.View key={`${square}-${moves.length}`} entering={FadeIn.duration(220)} pointerEvents="none" style={local.lastMove} />
							) : null}
							{legalTargets.includes(square) ? <Animated.View entering={ZoomIn.duration(140)} exiting={FadeOut.duration(80)} style={gameStyles.legalDot} /> : null}
						</Pressable>
					);
				})
			)}
			{kingInCheck ? <CheckGlow {...at(kingInCheck)} size={cell} /> : null}
			{pieces.map((piece) => (
				<AnimatedPiece
					key={piece.id}
					{...at(piece.square)}
					size={cell}
					glyph={UNICODE_PIECES[`${piece.color}${piece.type}`]}
					color={piece.color === "b" ? palette.black : palette.white}
					heavy={palette.heavy}
					settled={settled}
				/>
			))}
		</View>
	);
}

/** The four choices when a pawn reaches the last rank. */
export function PromotionPicker({ color, cosmetics, label, onPick }: { color: "w" | "b"; cosmetics: ExtraGameCosmetics; label: string; onPick: (piece: "q" | "r" | "b" | "n") => void }) {
	const { currentTheme } = useTheme();
	const palette = CHESS_PIECE_COLORS[cosmetics.chessPieces];
	return (
		<Animated.View entering={ZoomIn.duration(160)} style={local.promotion}>
			<Text style={[local.promotionLabel, { color: currentTheme.textSecondary }]}>{label}</Text>
			<View style={local.promotionRow}>
				{(["q", "r", "b", "n"] as const).map((piece) => (
					<Pressable
						key={piece}
						testID={`chess-promote-${piece}`}
						accessibilityRole="button"
						accessibilityLabel={piece}
						onPress={() => onPick(piece)}
						style={[local.promotionButton, { borderColor: currentTheme.accent }]}
					>
						<Text style={[gameStyles.chessPiece, { color: color === "b" ? palette.black : palette.white, backgroundColor: color === "w" ? "rgba(15,23,42,0.55)" : "rgba(255,255,255,0.7)", borderRadius: 6 }]}>
							{UNICODE_PIECES[`${color}${piece}`]}
						</Text>
					</Pressable>
				))}
			</View>
		</Animated.View>
	);
}

/** Avatar square, name, rating and (in timed games) the clock of one player. */
export function PlayerBar({
	name,
	rating,
	color,
	clock,
	active,
	low,
	look,
}: {
	name: string;
	rating?: string;
	color: string;
	look?: BotLook;
	clock?: string;
	active: boolean;
	low?: boolean;
}) {
	const { currentTheme } = useTheme();
	const pulse = useSharedValue(1);
	useEffect(() => {
		pulse.value = low && active ? withRepeat(withSequence(withTiming(1.12, { duration: 350 }), withTiming(1, { duration: 350 })), -1, false) : withTiming(1, { duration: 150 });
	}, [low, active, pulse]);
	const clockStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
	return (
		<View style={local.bar}>
			{look ? (
				<BotAvatar look={look} color={color} size={34} />
			) : (
				<View style={[local.avatar, { backgroundColor: color }]}>
					<Text style={local.avatarText}>{name.trim()[0]?.toUpperCase() ?? "?"}</Text>
				</View>
			)}
			<Text numberOfLines={1} style={[local.name, { color: currentTheme.textPrimary }]}>{name}</Text>
			{rating ? <Text style={[local.rating, { color: currentTheme.textSecondary }]}>{rating}</Text> : null}
			{clock ? (
				<Animated.View style={[local.clock, { borderColor: active ? currentTheme.accent : "rgba(255,255,255,0.2)" }, clockStyle]}>
					<Text style={[local.clockText, { color: low ? "#F87171" : active ? currentTheme.accent : currentTheme.textPrimary }]}>{clock}</Text>
				</Animated.View>
			) : null}
		</View>
	);
}

/** Half-moves as "1. e4 e5": the viewed one is underlined. */
export function MoveStrip({ history, viewPly }: { history: string[]; viewPly: number }) {
	const { currentTheme } = useTheme();
	const pairs: { number: number; white: string; black?: string; whitePly: number }[] = [];
	for (let i = 0; i < history.length; i += 2) pairs.push({ number: i / 2 + 1, white: history[i], black: history[i + 1], whitePly: i + 1 });
	if (pairs.length === 0) return null;
	return (
		<View style={local.moves}>
			{pairs.slice(-4).map((pair) => (
				<Animated.Text key={pair.number} entering={FadeIn.duration(180)} style={[local.move, { color: currentTheme.textSecondary }]}>
					{pair.number}.{" "}
					<Text style={[local.moveSan, { color: currentTheme.textPrimary }, viewPly === pair.whitePly && local.moveActive]}>{pair.white}</Text>
					{pair.black ? (
						<Text style={[local.moveSan, { color: currentTheme.textPrimary }, viewPly === pair.whitePly + 1 && local.moveActive]}>{` ${pair.black}`}</Text>
					) : null}
				</Animated.Text>
			))}
		</View>
	);
}

const local = StyleSheet.create({
	lastMove: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255,196,0,0.42)" },
	piece: { position: "absolute", alignItems: "center", justifyContent: "center" },
	promotion: { alignItems: "center", gap: 6, marginTop: 8 },
	promotionLabel: { fontFamily: "Silkscreen", fontSize: 10 },
	promotionRow: { flexDirection: "row", gap: 8 },
	promotionButton: { borderWidth: 2, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, alignItems: "center", justifyContent: "center" },
	bar: { flexDirection: "row", alignItems: "center", gap: 8, width: "100%", maxWidth: 336, marginVertical: 6 },
	avatar: { width: 28, height: 28, borderRadius: 4, alignItems: "center", justifyContent: "center" },
	avatarText: { fontFamily: "SilkscreenBold", fontSize: 13, color: "#0b0b10" },
	name: { fontFamily: "SilkscreenBold", fontSize: 12, flexShrink: 1 },
	rating: { fontFamily: "Silkscreen", fontSize: 10 },
	clock: { marginLeft: "auto", borderWidth: 2, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: "rgba(255,255,255,0.06)" },
	clockText: { fontFamily: "SilkscreenBold", fontSize: 14 },
	moves: { width: "100%", maxWidth: 336, flexDirection: "row", flexWrap: "wrap", columnGap: 10, rowGap: 2, marginTop: 8 },
	move: { fontFamily: "Silkscreen", fontSize: 10 },
	moveSan: { fontFamily: "SilkscreenBold", fontSize: 11 },
	moveActive: { textDecorationLine: "underline" },
});
