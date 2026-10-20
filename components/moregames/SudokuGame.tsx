import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { useState, useRef, useEffect } from "react";
import { submitMoreGameSoloResult } from "@/constants/Supabase";
import { View, Text, Pressable } from "react-native";
import StylizedButton from "../StylizedButton";
import { cssColors } from "@/constants/Color";
import { ExtraGameCosmetics, SUDOKU_THEMES, SudokuPalette } from "./cosmetics";
import { styles } from "./styles";

export const SUDOKU_MAX_MISTAKES = 3;
export const SUDOKU_TARGET_REMOVED = 48; // leaves ~33 givens (medium difficulty)

export type SudokuBoard = { puzzle: number[][]; solution: number[][] };

export function shuffleInPlace<T>(items: T[]): T[] {
	for (let i = items.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1));
		[items[i], items[j]] = [items[j], items[i]];
	}
	return items;
}

export function isSudokuSafe(grid: number[][], row: number, col: number, value: number) {
	for (let i = 0; i < 9; i += 1) {
		if (grid[row][i] === value || grid[i][col] === value) return false;
	}
	const boxRow = Math.floor(row / 3) * 3;
	const boxCol = Math.floor(col / 3) * 3;
	for (let r = 0; r < 3; r += 1) {
		for (let c = 0; c < 3; c += 1) {
			if (grid[boxRow + r][boxCol + c] === value) return false;
		}
	}
	return true;
}

export function fillSudokuSolution(grid: number[][]): boolean {
	for (let row = 0; row < 9; row += 1) {
		for (let col = 0; col < 9; col += 1) {
			if (grid[row][col] !== 0) continue;
			for (const value of shuffleInPlace([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
				if (!isSudokuSafe(grid, row, col, value)) continue;
				grid[row][col] = value;
				if (fillSudokuSolution(grid)) return true;
				grid[row][col] = 0;
			}
			return false;
		}
	}
	return true;
}

export function countSudokuSolutions(grid: number[][], limit: number): number {
	for (let row = 0; row < 9; row += 1) {
		for (let col = 0; col < 9; col += 1) {
			if (grid[row][col] !== 0) continue;
			let count = 0;
			for (let value = 1; value <= 9; value += 1) {
				if (!isSudokuSafe(grid, row, col, value)) continue;
				grid[row][col] = value;
				count += countSudokuSolutions(grid, limit - count);
				grid[row][col] = 0;
				if (count >= limit) return count;
			}
			return count;
		}
	}
	return 1;
}

// Generates a fresh puzzle with a unique solution so "New game" always shows new numbers.
export function generateSudoku(): SudokuBoard {
	const solution = Array.from({ length: 9 }, () => Array(9).fill(0));
	fillSudokuSolution(solution);
	const puzzle = solution.map((row) => [...row]);

	let removed = 0;
	for (const cell of shuffleInPlace(Array.from({ length: 81 }, (_, index) => index))) {
		if (removed >= SUDOKU_TARGET_REMOVED) break;
		const row = Math.floor(cell / 9);
		const col = cell % 9;
		if (puzzle[row][col] === 0) continue;
		const backup = puzzle[row][col];
		puzzle[row][col] = 0;
		const probe = puzzle.map((line) => [...line]);
		if (countSudokuSolutions(probe, 2) === 1) {
			removed += 1;
		} else {
			puzzle[row][col] = backup;
		}
	}
	return { puzzle, solution };
}

export function SudokuGame({ cosmetics, playerName, onRatingChange }: { cosmetics: ExtraGameCosmetics; playerName: string; onRatingChange: () => void }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const [board, setBoard] = useState<SudokuBoard>(generateSudoku);
	const [grid, setGrid] = useState<number[][]>(() => board.puzzle.map((row) => [...row]));
	const [notes, setNotes] = useState<Record<string, number[]>>({});
	const [selected, setSelected] = useState<[number, number] | null>(null);
	const [noteMode, setNoteMode] = useState(false);
	const [mistakes, setMistakes] = useState(0);
	const ratingSubmittedRef = useRef(false);
	const { puzzle, solution } = board;
	const complete = grid.every((row, y) => row.every((value, x) => value === solution[y][x]));
	const lost = mistakes >= SUDOKU_MAX_MISTAKES;
	const finished = complete || lost;
	const sudoku: SudokuPalette = SUDOKU_THEMES[cosmetics.sudokuTheme];
	const sudokuText = sudoku.given ?? currentTheme.textPrimary;

	useEffect(() => {
		if (!finished || ratingSubmittedRef.current) return;
		ratingSubmittedRef.current = true;
		void submitMoreGameSoloResult({
			gameId: "sudoku",
			playerName,
			won: complete,
			score: complete ? Math.max(0, 1000 - mistakes * 100) : 0,
			metadata: { mistakes, result: complete ? "win" : "loss" },
		}).then(() => onRatingChange());
	}, [complete, finished, mistakes, onRatingChange, playerName]);

	const startNewGame = () => {
		const next = generateSudoku();
		setBoard(next);
		setGrid(next.puzzle.map((row) => [...row]));
		setNotes({});
		setSelected(null);
		setMistakes(0);
		ratingSubmittedRef.current = false;
	};

	const restartGame = () => {
		setGrid(puzzle.map((row) => [...row]));
		setNotes({});
		setSelected(null);
		setMistakes(0);
		ratingSubmittedRef.current = false;
	};

	const setNumber = (value: number) => {
		if (!selected || finished) return;
		const [y, x] = selected;
		if (puzzle[y][x] !== 0) return;

		const key = `${y}-${x}`;
		if (noteMode && value !== 0) {
			if (grid[y][x] !== 0) return;
			setNotes((current) => {
				const currentNotes = current[key] || [];
				const nextNotes = currentNotes.includes(value) ? currentNotes.filter((item) => item !== value) : [...currentNotes, value].sort();
				return { ...current, [key]: nextNotes };
			});
			return;
		}

		if (value === grid[y][x]) return;
		if (value !== 0 && value !== solution[y][x]) {
			setMistakes((current) => current + 1);
		}

		setNotes((current) => {
			const next = { ...current, [key]: [] };
			if (value !== 0 && value === solution[y][x]) {
				for (const noteKey of Object.keys(next)) {
					const [row, col] = noteKey.split("-").map(Number);
					if (row === y || col === x || (Math.floor(row / 3) === Math.floor(y / 3) && Math.floor(col / 3) === Math.floor(x / 3))) {
						next[noteKey] = next[noteKey].filter((note) => note !== value);
					}
				}
			}
			return next;
		});
		setGrid((current) => current.map((row, rowIndex) => (
			row.map((cell, colIndex) => rowIndex === y && colIndex === x ? value : cell)
		)));
	};

	return (
		<View style={[styles.centerGame, sudoku.surface && styles.woodGameSurface, sudoku.surface && { backgroundColor: sudoku.surface.bg, borderColor: sudoku.surface.border }]}>
			<View style={styles.sudokuTopBar}>
				<Text style={[styles.gameStatus, { color: complete ? "#7C2D12" : lost ? "#DC2626" : sudoku.status ?? currentTheme.textPrimary }]}>
					{complete ? t("sudoku.solved") : lost ? t("sudoku.gameOver") : selected ? `${t("sudoku.mistakes")} ${mistakes}/${SUDOKU_MAX_MISTAKES}` : t("sudoku.selectCell")}
				</Text>
				<Pressable onPress={() => setNoteMode((value) => !value)} style={[styles.noteToggle, { borderColor: noteMode ? "#FACC15" : "rgba(0,0,0,0.25)" }]}>
					<Text style={[styles.noteToggleText, { color: sudoku.status ?? currentTheme.textPrimary }]}>{t("sudoku.notes")} {noteMode ? t("common.on") : t("common.off")}</Text>
				</Pressable>
			</View>
			<View style={styles.sudokuBoardWrap}>
				<View style={[styles.sudokuBoard, { borderColor: sudoku.boardBorder, backgroundColor: sudoku.boardBg }]}>
					{grid.map((row, y) => row.map((value, x) => {
						const fixed = puzzle[y][x] !== 0;
						const isSelected = selected?.[0] === y && selected?.[1] === x;
						const related = selected && (selected[0] === y || selected[1] === x || (Math.floor(selected[0] / 3) === Math.floor(y / 3) && Math.floor(selected[1] / 3) === Math.floor(x / 3)));
						const wrong = value !== 0 && value !== solution[y][x];
						const key = `${y}-${x}`;

						return (
							<Pressable
								key={key}
								onPress={() => setSelected([y, x])}
								style={[
									styles.sudokuCell,
									{ borderColor: sudoku.cellBorder, backgroundColor: sudoku.cellBg },
									sudoku.cellShadow ? { shadowColor: sudoku.cellShadow, shadowOpacity: 0.22, shadowRadius: 2 } : null,
									related && !isSelected && { backgroundColor: sudoku.related },
									isSelected && { backgroundColor: sudoku.selected },
									(y + 1) % 3 === 0 && y < 8 && styles.sudokuCellBottom,
									(x + 1) % 3 === 0 && x < 8 && styles.sudokuCellRight,
								]}
							>
								{value ? (
									<Text style={[
										styles.sudokuText,
										{ color: wrong ? "#DC2626" : fixed ? sudokuText : (sudoku.entry ?? currentTheme.accent) },
									]}>
										{value}
									</Text>
								) : (
									<Text style={[styles.sudokuNotes, { color: sudoku.notes ?? currentTheme.textSecondary }]}>{notes[key]?.join("") || ""}</Text>
								)}
							</Pressable>
						);
					}))}
				</View>
				{finished && (
					<View style={styles.sudokuOverlay}>
						<View style={[styles.sudokuOverlayCard, { borderColor: complete ? "#22C55E" : "#DC2626" }]}>
							<Text style={[styles.sudokuOverlayTitle, { color: complete ? "#22C55E" : "#F87171" }]}>
								{complete ? t("sudoku.solved") : t("sudoku.gameOver")}
							</Text>
							<Text style={styles.sudokuOverlaySub}>
								{complete ? t("sudoku.cleanBoard") : `${t("sudoku.mistakes")} ${mistakes}/${SUDOKU_MAX_MISTAKES}`}
							</Text>
							<View style={styles.sudokuOverlayButtons}>
								<StylizedButton text={t("sudoku.restart")} onClick={restartGame} backgroundColor={cssColors.spaceGray} style={styles.sudokuOverlayButton} textStyle={styles.smallButtonText} />
								<StylizedButton text={t("sudoku.newGame")} onClick={startNewGame} backgroundColor={currentTheme.buttonPrimary} style={styles.sudokuOverlayButton} textStyle={styles.smallButtonText} />
							</View>
						</View>
					</View>
				)}
			</View>
			<View style={styles.numberPad}>
				{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => (
					<Pressable key={number} onPress={() => setNumber(number)} style={[styles.sudokuNumberTile, sudoku.tile && { borderColor: sudoku.tile.border, backgroundColor: sudoku.tile.bg }, finished && styles.disabledControl]} disabled={finished}>
						<Text style={[styles.sudokuNumberText, { color: sudoku.tileText ?? currentTheme.textPrimary }]}>{number}</Text>
					</Pressable>
				))}
				<StylizedButton text={t("sudoku.clear")} onClick={() => setNumber(0)} backgroundColor={cssColors.spaceGray} style={styles.clearNumberButton} textStyle={styles.tinyButtonText} />
				<StylizedButton text={t("sudoku.newGame")} onClick={startNewGame} backgroundColor={currentTheme.buttonPrimary} style={styles.clearNumberButton} textStyle={styles.tinyButtonText} />
			</View>
		</View>
	);
}