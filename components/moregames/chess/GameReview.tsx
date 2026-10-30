import { Chess } from "chess.js";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { Color } from "@/constants/chess/ChessClock";
import { MoveGrade, PositionEval, ReviewedMove, accuracy, countGrades, reviewGame, toWhiteCp } from "@/constants/chess/Review";
import { ExtraGameCosmetics } from "../cosmetics";
import StylizedButton from "../../StylizedButton";
import { ChessBoard } from "./ChessParts";
import { useChessEngine } from "./EngineHost";

const GRADE_COLORS: Record<MoveGrade, string> = { best: "#4ADE80", good: "#A3A3A3", inaccuracy: "#FACC15", mistake: "#FB923C", blunder: "#EF4444" };
const GRADE_MARKS: Record<MoveGrade, string> = { best: "!", good: "", inaccuracy: "?!", mistake: "?", blunder: "??" };
const DEPTH = 10;

/** Review of a finished game: Stockfish grades every move and shows what it would have played instead. */
export function GameReview({ history, myColor, cosmetics, onClose }: { history: readonly string[]; myColor: Color; cosmetics: ExtraGameCosmetics; onClose: () => void }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const engine = useChessEngine();
	const positions = useMemo(() => {
		const chess = new Chess();
		const fens = [chess.fen()];
		const ucis: string[] = [];
		for (const san of history) {
			const move = chess.move(san);
			ucis.push(`${move.from}${move.to}${move.promotion ?? ""}`);
			fens.push(chess.fen());
		}
		return { fens, ucis };
	}, [history]);
	const [evals, setEvals] = useState<PositionEval[]>([]);
	const [ply, setPly] = useState(history.length);

	useEffect(() => {
		if (!engine) return;
		let cancelled = false;
		void (async () => {
			const found: PositionEval[] = [];
			for (const fen of positions.fens) {
				const chess = new Chess(fen);
				const side = chess.turn();
				let cp = 0;
				let bestMove: string | null = null;
				if (chess.isGameOver()) {
					// the side to move is mated, or it is a draw
					if (chess.isCheckmate()) cp = side === "w" ? -1000 : 1000;
				} else {
					const result = await engine.search(fen, { depth: DEPTH, movetimeMs: 1500 });
					cp = toWhiteCp(result, side);
					bestMove = result.bestMove;
				}
				if (cancelled) return;
				found.push({ cp, bestMove });
				setEvals([...found]);
			}
		})();
		return () => { cancelled = true; };
	}, [engine, positions]);

	const done = evals.length === positions.fens.length;
	const moves: ReviewedMove[] = useMemo(() => (done ? reviewGame(history, positions.ucis, evals) : []), [done, history, positions.ucis, evals]);
	const opponent: Color = myColor === "w" ? "b" : "w";
	const selectedMove = ply > 0 ? moves[ply - 1] : undefined;
	const better = selectedMove?.better;
	const hint = better ? { from: better.slice(0, 2), to: better.slice(2, 4) } : null;
	const shownEval = evals[ply]?.cp;

	if (!engine) {
		return (
			<View style={local.screen}>
				<Text style={[local.title, { color: currentTheme.textPrimary }]}>{t("review.title")}</Text>
				<Text style={[local.small, { color: currentTheme.textSecondary }]}>{t("review.noEngine")}</Text>
				<StylizedButton text={t("common.back")} onClick={onClose} backgroundColor="#555" style={local.button} textStyle={{ fontSize: 11 }} />
			</View>
		);
	}

	return (
		<View style={local.screen}>
			<Text style={[local.title, { color: currentTheme.textPrimary }]}>{t("review.title")}</Text>
			{!done ? (
				<Text testID="review-progress" style={[local.small, { color: currentTheme.textSecondary }]}>{t("review.analysing", { done: evals.length, total: positions.fens.length })}</Text>
			) : (
				<View style={local.summary}>
					{([myColor, opponent] as Color[]).map((side) => {
						const counts = countGrades(moves, side);
						return (
							<View key={side} style={[local.side, { borderColor: "rgba(255,255,255,0.18)" }]}>
								<Text style={[local.small, { color: currentTheme.textSecondary }]}>{side === myColor ? t("review.you") : t("review.opponent")}</Text>
								<Text testID={`review-accuracy-${side}`} style={[local.big, { color: currentTheme.textPrimary }]}>{accuracy(moves, side)}%</Text>
								<Text style={[local.tiny, { color: GRADE_COLORS.blunder }]}>{t("review.blunders", { n: counts.blunder })}</Text>
								<Text style={[local.tiny, { color: GRADE_COLORS.mistake }]}>{t("review.mistakes", { n: counts.mistake })}</Text>
								<Text style={[local.tiny, { color: GRADE_COLORS.inaccuracy }]}>{t("review.inaccuracies", { n: counts.inaccuracy })}</Text>
							</View>
						);
					})}
				</View>
			)}
			<View style={{ width: "100%", maxWidth: 360 }}>
				<ChessBoard
					// a move the engine would not play is shown from the position before it, with the better move marked
					fen={better ? positions.fens[ply - 1] : positions.fens[ply]}
					moves={[]}
					flipped={myColor === "b"}
					selected={null}
					legalTargets={[]}
					lastMove={null}
					hint={hint}
					cosmetics={cosmetics}
					onPressSquare={() => undefined}
				/>
			</View>
			<Text style={[local.small, { color: currentTheme.textPrimary }]}>
				{shownEval !== undefined ? `${shownEval >= 0 ? "+" : ""}${(shownEval / 100).toFixed(1)}` : "…"}
				{selectedMove && better ? `  ·  ${t("review.better", { move: better })}` : ""}
			</Text>
			<ScrollView horizontal style={{ maxHeight: 44, width: "100%" }} contentContainerStyle={{ gap: 6, paddingHorizontal: 4, alignItems: "center" }}>
				{history.map((san, index) => {
					const graded = moves[index];
					const active = ply === index + 1;
					return (
						<Pressable key={index} onPress={() => setPly(index + 1)} style={[local.move, { borderColor: active ? currentTheme.accent : "transparent" }]}>
							<Text style={[local.moveText, { color: graded ? GRADE_COLORS[graded.grade] : currentTheme.textSecondary }]}>
								{index % 2 === 0 ? `${index / 2 + 1}.` : ""}{san}{graded ? GRADE_MARKS[graded.grade] : ""}
							</Text>
						</Pressable>
					);
				})}
			</ScrollView>
			<View style={local.nav}>
				<StylizedButton text="<" onClick={() => setPly((value) => Math.max(1, value - 1))} backgroundColor="#374151" style={local.navButton} textStyle={{ fontSize: 14 }} />
				<StylizedButton text=">" onClick={() => setPly((value) => Math.min(history.length, value + 1))} backgroundColor="#374151" style={local.navButton} textStyle={{ fontSize: 14 }} />
			</View>
			<StylizedButton text={t("common.back")} onClick={onClose} backgroundColor="#555" style={local.button} textStyle={{ fontSize: 11 }} />
		</View>
	);
}

const local = StyleSheet.create({
	screen: { width: "100%", alignItems: "center", gap: 8, paddingVertical: 4 },
	title: { fontFamily: "SilkscreenBold", fontSize: 16 },
	summary: { flexDirection: "row", gap: 8, width: "100%", maxWidth: 360 },
	side: { flex: 1, borderWidth: 2, borderRadius: 10, padding: 8, alignItems: "center", gap: 2, backgroundColor: "rgba(255,255,255,0.04)" },
	small: { fontFamily: "Silkscreen", fontSize: 11, textAlign: "center" },
	tiny: { fontFamily: "Silkscreen", fontSize: 9 },
	big: { fontFamily: "SilkscreenBold", fontSize: 20 },
	move: { borderWidth: 2, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4 },
	moveText: { fontFamily: "SilkscreenBold", fontSize: 12 },
	nav: { flexDirection: "row", gap: 12 },
	navButton: { minWidth: 64, height: 40, minHeight: 40, margin: 0 },
	button: { minWidth: 120, height: 42, minHeight: 42, margin: 0 },
});
