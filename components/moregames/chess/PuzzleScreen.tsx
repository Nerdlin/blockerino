import { Chess, Square } from "chess.js";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { useSoundSettings } from "@/constants/Sound";
import { moveSoundFor } from "@/constants/chess/ChessSounds";
import {
	Puzzle,
	PuzzlePosition,
	PuzzleProgress,
	PuzzleRow,
	START_PUZZLE_RATING,
	answerPuzzle,
	loadPuzzleProgress,
	nextPuzzleRating,
	parsePuzzles,
	pickPuzzle,
	savePuzzleProgress,
	startPuzzle,
} from "@/constants/chess/Puzzles";
import { ExtraGameCosmetics } from "../cosmetics";
import StylizedButton from "../../StylizedButton";
import { ChessBoard } from "./ChessParts";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PUZZLES: Puzzle[] = parsePuzzles(require("@/assets/chess/puzzles.json") as PuzzleRow[]);

type Status = "play" | "wrong" | "solved" | "shown";

/** Chess puzzles: find the best move (and the ones after it) in a position from a real game. */
export function PuzzleScreen({ cosmetics, onBack }: { cosmetics: ExtraGameCosmetics; onBack: () => void }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const { playSfx } = useSoundSettings();
	const [progress, setProgress] = useState<PuzzleProgress>({ rating: START_PUZZLE_RATING, solved: [], streak: 0 });
	const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
	const [position, setPosition] = useState<PuzzlePosition | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const [status, setStatus] = useState<Status>("play");
	// a puzzle counts for the rating once: the first mistake or the first clean solve
	const [rated, setRated] = useState(false);
	const [delta, setDelta] = useState<number | null>(null);

	const open = (next: Puzzle | null) => {
		setPuzzle(next);
		setPosition(next ? startPuzzle(next) : null);
		setSelected(null);
		setStatus("play");
		setRated(false);
		setDelta(null);
	};

	useEffect(() => {
		void loadPuzzleProgress().then((loaded) => {
			setProgress(loaded);
			open(pickPuzzle(PUZZLES, loaded.rating, loaded.solved));
		});
	}, []);

	const legalTargets = useMemo(() => {
		if (!position || !selected || status !== "play") return [];
		return new Chess(position.fen).moves({ square: selected as Square, verbose: true }).map((move) => move.to);
	}, [position, selected, status]);

	const rate = (solved: boolean) => {
		if (!puzzle || rated) return progress;
		const rating = nextPuzzleRating(progress.rating, puzzle.rating, solved);
		const next: PuzzleProgress = {
			rating,
			solved: solved ? [...progress.solved, puzzle.id] : progress.solved,
			streak: solved ? progress.streak + 1 : 0,
		};
		setRated(true);
		setDelta(rating - progress.rating);
		setProgress(next);
		void savePuzzleProgress(next);
		return next;
	};

	const onPressSquare = (square: string) => {
		if (!puzzle || !position || status !== "play") return;
		const chess = new Chess(position.fen);
		const piece = chess.get(square as Square);
		if (piece && piece.color === position.playerColor) {
			setSelected(square === selected ? null : square);
			return;
		}
		if (!selected || !legalTargets.includes(square as Square)) {
			setSelected(null);
			return;
		}
		// a promotion takes the piece the solution wants, a queen otherwise
		const wanted = puzzle.moves[position.step];
		const promotion = wanted && wanted.startsWith(selected + square) && wanted.length > 4 ? wanted[4] : "";
		const isPawnPromotion = chess.get(selected as Square)?.type === "p" && (square[1] === "8" || square[1] === "1");
		const uci = `${selected}${square}${promotion || (isPawnPromotion ? "q" : "")}`;
		setSelected(null);
		const answer = answerPuzzle(puzzle, position, uci);
		if (answer.result === "wrong") {
			void playSfx("invalidPlacement");
			rate(false);
			setStatus("wrong");
			return;
		}
		const san = answer.position.history[answer.position.history.length - (answer.result === "solved" ? 1 : 2)];
		void playSfx(moveSoundFor(san ?? ""));
		setPosition(answer.position);
		if (answer.result === "solved") {
			if (!rated) rate(true);
			void playSfx("chessWin");
			setStatus("solved");
		}
	};

	const showSolution = () => {
		if (!puzzle) return;
		rate(false);
		// replay the whole line from the start position
		let shown = startPuzzle(puzzle);
		while (shown.step < puzzle.moves.length) {
			const answer = answerPuzzle(puzzle, shown, puzzle.moves[shown.step]);
			if (answer.result === "wrong") break;
			shown = answer.position;
			if (answer.result === "solved") break;
		}
		setPosition(shown);
		setStatus("shown");
	};

	const retry = () => {
		if (!puzzle) return;
		setPosition(startPuzzle(puzzle));
		setSelected(null);
		setStatus("play");
	};

	const next = () => open(pickPuzzle(PUZZLES, progress.rating, progress.solved));

	if (!puzzle || !position) {
		return (
			<View style={local.screen}>
				<Text style={[local.status, { color: currentTheme.textSecondary }]}>{t("puzzles.empty")}</Text>
				<StylizedButton text={t("common.back")} onClick={onBack} backgroundColor="#555" style={local.button} textStyle={{ fontSize: 11 }} />
			</View>
		);
	}

	const toMove = position.playerColor === "w" ? t("puzzles.whiteToMove") : t("puzzles.blackToMove");
	const statusText =
		status === "solved" ? t("puzzles.solved")
		: status === "wrong" ? t("puzzles.wrong")
		: status === "shown" ? t("puzzles.shown")
		: toMove;

	return (
		<View style={local.screen}>
			<View style={local.header}>
				<Text style={[local.small, { color: currentTheme.textSecondary }]}>{t("puzzles.rating")}</Text>
				<Text testID="puzzle-rating" style={[local.big, { color: currentTheme.textPrimary }]}>
					{progress.rating}
					{delta !== null ? <Text style={{ color: delta >= 0 ? "#4ADE80" : "#F87171", fontSize: 14 }}>{` ${delta >= 0 ? "+" : ""}${delta}`}</Text> : null}
				</Text>
				<Text style={[local.small, { color: currentTheme.textSecondary }]}>{t("puzzles.streak", { n: progress.streak })}</Text>
			</View>
			<Text testID="puzzle-status" style={[local.status, { color: status === "solved" ? "#4ADE80" : status === "wrong" ? "#F87171" : currentTheme.textPrimary }]}>{statusText}</Text>
			<View style={{ width: "100%", maxWidth: 400 }}>
				<ChessBoard
					fen={position.fen}
					moves={[]}
					flipped={position.playerColor === "b"}
					selected={selected}
					legalTargets={legalTargets}
					lastMove={position.lastMove}
					hint={null}
					cosmetics={cosmetics}
					onPressSquare={onPressSquare}
				/>
			</View>
			<Text style={[local.small, { color: currentTheme.textSecondary }]}>{t("puzzles.puzzleRating", { n: puzzle.rating })}</Text>
			<View style={local.buttons}>
				{status === "wrong" && <StylizedButton text={t("puzzles.retry")} onClick={retry} backgroundColor="#2563EB" style={local.button} textStyle={{ fontSize: 11 }} />}
				{(status === "play" || status === "wrong") && <StylizedButton text={t("puzzles.solution")} onClick={showSolution} backgroundColor="#555" style={local.button} textStyle={{ fontSize: 11 }} />}
				{(status === "solved" || status === "shown") && <StylizedButton text={t("puzzles.next")} onClick={next} backgroundColor="#2E9E4F" style={local.button} textStyle={{ fontSize: 11 }} />}
			</View>
			<StylizedButton text={t("common.back")} onClick={onBack} backgroundColor="#555" style={local.button} textStyle={{ fontSize: 11 }} />
			<Text style={[local.tiny, { color: currentTheme.textSecondary }]}>{t("puzzles.source")}</Text>
		</View>
	);
}

const local = StyleSheet.create({
	screen: { width: "100%", alignItems: "center", gap: 10, paddingVertical: 4 },
	header: { flexDirection: "row", alignItems: "baseline", gap: 10 },
	small: { fontFamily: "Silkscreen", fontSize: 10 },
	tiny: { fontFamily: "Silkscreen", fontSize: 8, textAlign: "center" },
	big: { fontFamily: "SilkscreenBold", fontSize: 22 },
	status: { fontFamily: "SilkscreenBold", fontSize: 13, textAlign: "center" },
	buttons: { flexDirection: "row", gap: 10, flexWrap: "wrap", justifyContent: "center" },
	button: { minWidth: 120, height: 42, minHeight: 42, margin: 0 },
});
