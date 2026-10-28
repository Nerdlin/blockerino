import { Chess } from "chess.js";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/constants/Theme";
import { CHESS_BOARD_COLORS, CHESS_PIECE_COLORS, ExtraGameCosmetics } from "../cosmetics";
import { styles as gameStyles } from "../styles";
import { BotLook } from "@/constants/chess/BotSprites";
import { BotAvatar } from "./BotAvatar";

export const CHESS_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
export const CHESS_RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];
export const UNICODE_PIECES: Record<string, string> = {
	wp: "♙", wn: "♘", wb: "♗", wr: "♖", wq: "♕", wk: "♔",
	bp: "♟", bn: "♞", bb: "♝", br: "♜", bq: "♛", bk: "♚",
};

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

export function ChessBoard({
	fen,
	flipped,
	selected,
	legalTargets,
	lastMove,
	hint,
	cosmetics,
	onPressSquare,
}: {
	fen: string;
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
	const board = new Chess(fen);
	const kingInCheck = checkedKingSquare(fen);
	const palette = CHESS_PIECE_COLORS[cosmetics.chessPieces];

	const counts: Record<string, number> = {};
	const pieces = board.board().flatMap((row, r) =>
		row.map((piece, f) => {
			if (!piece) return null;
			const prefix = `${piece.color}${piece.type}`;
			counts[prefix] = (counts[prefix] || 0) + 1;
			return {
				id: `${prefix}-${counts[prefix]}`,
				label: UNICODE_PIECES[prefix],
				color: piece.color,
				top: `${ranks.indexOf(CHESS_RANKS[r]) * 12.5}%`,
				left: `${files.indexOf(CHESS_FILES[f]) * 12.5}%`,
			};
		})
	).filter((piece): piece is NonNullable<typeof piece> => piece !== null);

	return (
		<View style={gameStyles.chessBoard}>
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
										: kingInCheck === square ? "#F87171"
										: getChessBoardColors(cosmetics.chessBoard, dark),
								},
							]}
						>
							{marked && selected !== square && <View pointerEvents="none" style={local.lastMove} />}
							{legalTargets.includes(square) && <View style={gameStyles.legalDot} />}
						</Pressable>
					);
				})
			)}
			{pieces.map((piece) => (
				<View key={piece.id} pointerEvents="none" style={[local.piece, { top: piece.top as never, left: piece.left as never }]}>
					<Text
						style={[
							gameStyles.chessPiece,
							palette.heavy && gameStyles.chessPieceClub,
							{ color: piece.color === "b" ? palette.black : palette.white },
						]}
					>
						{piece.label}
					</Text>
				</View>
			))}
		</View>
	);
}

/** The four choices when a pawn reaches the last rank. */
export function PromotionPicker({ color, cosmetics, label, onPick }: { color: "w" | "b"; cosmetics: ExtraGameCosmetics; label: string; onPick: (piece: "q" | "r" | "b" | "n") => void }) {
	const { currentTheme } = useTheme();
	const palette = CHESS_PIECE_COLORS[cosmetics.chessPieces];
	return (
		<View style={local.promotion}>
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
		</View>
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
				<View style={[local.clock, { borderColor: active ? currentTheme.accent : "rgba(255,255,255,0.2)" }]}>
					<Text style={[local.clockText, { color: low ? "#F87171" : active ? currentTheme.accent : currentTheme.textPrimary }]}>{clock}</Text>
				</View>
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
				<Text key={pair.number} style={[local.move, { color: currentTheme.textSecondary }]}>
					{pair.number}.{" "}
					<Text style={[local.moveSan, { color: currentTheme.textPrimary }, viewPly === pair.whitePly && local.moveActive]}>{pair.white}</Text>
					{pair.black ? (
						<Text style={[local.moveSan, { color: currentTheme.textPrimary }, viewPly === pair.whitePly + 1 && local.moveActive]}>{` ${pair.black}`}</Text>
					) : null}
				</Text>
			))}
		</View>
	);
}

const local = StyleSheet.create({
	lastMove: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255,196,0,0.42)" },
	piece: { position: "absolute", width: "12.5%", height: "12.5%", alignItems: "center", justifyContent: "center" },
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
