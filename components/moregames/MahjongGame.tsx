import { useState, useRef, useEffect, useMemo } from "react";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { recordMoreGameWin } from "@/constants/Achievements";
import { submitMoreGameSoloResult } from "@/constants/Supabase";
import { View, Text, Pressable } from "react-native";
import StylizedButton from "../StylizedButton";
import { cssColors } from "@/constants/Color";
import { MahjongTile } from "./types";
import { shuffleInPlace } from "./SudokuGame";
import { ExtraGameCosmetics, MAHJONG_THEMES } from "./cosmetics";
import { styles } from "./styles";

export const MAHJONG_SYMBOLS = ["四", "五", "六", "竹", "花", "中", "發", "東", "南", "北", "白", "九", "萬", "風", "春", "月", "山", "水"];
export const MAHJONG_LAYOUT: [number, number, number][] = buildMahjongLayout();

// A pyramid of three layers: a 7-wide base (38 tiles), a 5x4 middle (20) and a 2x2 top (4), 62 tiles in all. Each
// x/y is one tile cell; the upper layers sit exactly over lower tiles so the covering test stays column-exact.
function buildMahjongLayout(): [number, number, number][] {
	const cells: [number, number, number][] = [];
	for (let y = 0; y <= 5; y += 1) {
		const edge = y === 0 || y === 5;
		for (let x = edge ? 1 : 0; x <= (edge ? 5 : 6); x += 1) cells.push([x, y, 0]);
	}
	for (let y = 1; y <= 4; y += 1) for (let x = 1; x <= 5; x += 1) cells.push([x, y, 1]);
	for (const [x, y] of [[2, 2], [3, 2], [2, 3], [3, 3]]) cells.push([x, y, 2]);
	return cells;
}

export const MAHJONG_TILE_W = 46;
export const MAHJONG_TILE_H = 58;
export const MAHJONG_BOARD_W = 380;
export const MAHJONG_BOARD_H = 392;

// A tile is free when nothing sits on top of it (same column, higher layer) and at
// least one of its left/right neighbours on the same layer is missing. The covering
// test must be column-exact: with this layout the upper layers sit directly above
// lower tiles, so a loose threshold wrongly traps the board's edge tiles.
export function isPositionCovered(x: number, y: number, z: number, present: boolean[]): boolean {
	for (let i = 0; i < MAHJONG_LAYOUT.length; i += 1) {
		if (!present[i]) continue;
		const [ix, iy, iz] = MAHJONG_LAYOUT[i];
		if (iz > z && Math.abs(ix - x) < 0.9 && Math.abs(iy - y) < 0.9) return true;
	}
	return false;
}

export function isPositionSideBlocked(x: number, y: number, z: number, dx: number, present: boolean[]): boolean {
	for (let i = 0; i < MAHJONG_LAYOUT.length; i += 1) {
		if (!present[i]) continue;
		const [ix, iy, iz] = MAHJONG_LAYOUT[i];
		if (iz === z && ix === x + dx && Math.abs(iy - y) < 0.6) return true;
	}
	return false;
}

export function isLayoutIndexFree(index: number, present: boolean[]): boolean {
	if (!present[index]) return false;
	const [x, y, z] = MAHJONG_LAYOUT[index];
	if (isPositionCovered(x, y, z, present)) return false;
	return !isPositionSideBlocked(x, y, z, -1, present) || !isPositionSideBlocked(x, y, z, 1, present);
}

// Builds a guaranteed-solvable board: pairs are laid down in the reverse of a valid
// removal order, so at least one winning sequence always exists.
export function createMahjongTiles(): MahjongTile[] {
	const count = MAHJONG_LAYOUT.length;
	const symbols: string[] = new Array(count).fill("");
	const present = new Array<boolean>(count).fill(true);
	const pairSymbols = shuffleInPlace([...MAHJONG_SYMBOLS]);
	const failed = new Set<string>();
	const findOrder = (): [number, number][] | null => {
		if (!present.some(Boolean)) return [];
		const key = present.map(Number).join("");
		if (failed.has(key)) return null;
		const free = shuffleInPlace(present.map((_, index) => index).filter((index) => isLayoutIndexFree(index, present)));
		for (let i = 0; i < free.length; i++) {
			for (let j = i + 1; j < free.length; j++) {
				const a = free[i], b = free[j];
				present[a] = present[b] = false;
				const rest = findOrder();
				present[a] = present[b] = true;
				if (rest) return [[a, b], ...rest];
			}
		}
		failed.add(key);
		return null;
	};
	const order = findOrder();
	if (!order) throw new Error("Mahjong layout has no legal removal order");
	order.forEach(([a, b], step) => {
		const symbol = pairSymbols[step % pairSymbols.length];
		symbols[a] = symbol;
		symbols[b] = symbol;
	});

	return MAHJONG_LAYOUT.map(([x, y, z], index) => ({
		id: `${index}-${index}`,
		symbol: symbols[index],
		matchKey: symbols[index],
		x,
		y,
		z,
		removed: false,
	}));
}

export function isMahjongTileFree(tile: MahjongTile, tiles: MahjongTile[]) {
	if (tile.removed) return false;
	const present = MAHJONG_LAYOUT.map((_, index) => !tiles[index]?.removed);
	const layoutIndex = Number(tile.id.split("-")[0]);
	return isLayoutIndexFree(layoutIndex, present);
}

// True when no matchable pair is currently reachable but tiles remain (a soft deadlock).
export function hasFreeMahjongPair(tiles: MahjongTile[]): boolean {
	const free = tiles.filter((tile) => isMahjongTileFree(tile, tiles));
	return free.some((tile) => free.some((other) => other.id !== tile.id && other.matchKey === tile.matchKey));
}

// Reshuffles the remaining tiles' symbols, retrying until at least one move exists.
export function shuffleMahjongTiles(tiles: MahjongTile[]): MahjongTile[] {
	const activeIndexes = tiles.map((tile, index) => (tile.removed ? -1 : index)).filter((index) => index >= 0);
	const symbols = activeIndexes.map((index) => tiles[index].symbol);
	for (let attempt = 0; attempt < 40; attempt += 1) {
		shuffleInPlace(symbols);
		const next = tiles.map((tile) => ({ ...tile }));
		activeIndexes.forEach((index, order) => {
			next[index].symbol = symbols[order];
			next[index].matchKey = symbols[order];
		});
		if (hasFreeMahjongPair(next)) return next;
	}
	// A random retry limit must never leave the shuffle button ineffective.
	const next = tiles.map((tile) => ({ ...tile }));
	const free = activeIndexes.filter((index) => isMahjongTileFree(next[index], next));
	if (free.length >= 2) {
		const first = free[0];
		const second = free[1];
		const matching = activeIndexes.find((index) => index !== first && next[index].matchKey === next[first].matchKey);
		if (matching !== undefined) {
			[next[second].symbol, next[matching].symbol] = [next[matching].symbol, next[second].symbol];
			[next[second].matchKey, next[matching].matchKey] = [next[matching].matchKey, next[second].matchKey];
		}
	}
	return next;
}

export function MahjongGame({ cosmetics, playerName, onRatingChange }: { cosmetics: ExtraGameCosmetics; playerName: string; onRatingChange: () => void }) {
	const [boardWidth, setBoardWidth] = useState(MAHJONG_BOARD_W);
	const boardScale = Math.min(1, boardWidth / MAHJONG_BOARD_W);
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const [tiles, setTiles] = useState(createMahjongTiles);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [history, setHistory] = useState<MahjongTile[][]>([]);
	const [hint, setHint] = useState<string[]>([]);
	const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const clearHint = () => {
		if (hintTimer.current) clearTimeout(hintTimer.current);
		hintTimer.current = null;
		setHint([]);
	};
	useEffect(() => () => { if (hintTimer.current) clearTimeout(hintTimer.current); }, []);
	const ratingSubmittedRef = useRef(false);
	const remaining = tiles.filter((tile) => !tile.removed).length;
	const mahjong = MAHJONG_THEMES[cosmetics.mahjongTheme];

	useEffect(() => {
		if (remaining !== 0 || ratingSubmittedRef.current) return;
		ratingSubmittedRef.current = true;
		recordMoreGameWin("mahjong");
		void submitMoreGameSoloResult({
			gameId: "mahjong",
			playerName,
			won: true,
			score: Math.max(0, 1000 - history.length * 5),
			metadata: { moves: history.length },
		}).then(() => onRatingChange());
	}, [history.length, onRatingChange, playerName, remaining]);

	const freePairs = useMemo(() => {
		const free = tiles.filter((tile) => isMahjongTileFree(tile, tiles));
		for (const tile of free) {
			const pair = free.find((item) => item.id !== tile.id && item.matchKey === tile.matchKey);
			if (pair) return [tile.id, pair.id];
		}
		return [];
	}, [tiles]);

	const noMoves = remaining > 0 && freePairs.length === 0;

	const showHint = () => {
		if (freePairs.length === 0) return;
		setSelectedId(null);
		setHint(freePairs);
		if (hintTimer.current) clearTimeout(hintTimer.current);
		hintTimer.current = setTimeout(() => { hintTimer.current = null; setHint([]); }, 2500);
	};

	const pickTile = (id: string) => {
		clearHint();
		const picked = tiles.find((tile) => tile.id === id);
		if (!picked || !isMahjongTileFree(picked, tiles)) return;
		if (!selectedId) {
			setSelectedId(id);
			return;
		}

		if (selectedId === id) {
			setSelectedId(null);
			return;
		}

		const selected = tiles.find((tile) => tile.id === selectedId);
		if (selected?.matchKey === picked.matchKey) {
			setHistory((current) => [...current, tiles]);
			setTiles((current) => current.map((tile) => (
				tile.id === id || tile.id === selectedId ? { ...tile, removed: true } : tile
			)));
		}
		setSelectedId(null);
	};

	return (
		<View style={styles.centerGame}>
			<Text style={[styles.gameStatus, { color: remaining === 0 ? currentTheme.accent : noMoves ? "#F59E0B" : currentTheme.textPrimary }]}>
				{remaining === 0 ? t("mahjong.boardCleared") : noMoves ? t("mahjong.noMoves") : t("mahjong.tilesLeft", { count: remaining })}
			</Text>
			<View onLayout={(event) => setBoardWidth(event.nativeEvent.layout.width)} style={{ width: '100%', height: MAHJONG_BOARD_H * boardScale, alignItems: 'center' }}>
			<View style={[styles.mahjongLayerBoard, { backgroundColor: mahjong.board, borderColor: mahjong.boardBorder }, { position: 'absolute', left: Math.max(0, (boardWidth - MAHJONG_BOARD_W) / 2), transformOrigin: 'top left', transform: [{ scale: boardScale }] }]}>
				{tiles.map((tile) => {
					if (tile.removed) return null;
					const free = isMahjongTileFree(tile, tiles);
					const selected = selectedId === tile.id;
					const hinted = hint.includes(tile.id);
						return (
							<Pressable
								key={tile.id}
								onPress={() => pickTile(tile.id)}
								style={[
									styles.mahjongLayerTile,
									{
										left: 14 + tile.x * (MAHJONG_TILE_W + 2) + tile.z * 4,
										top: 12 + tile.y * (MAHJONG_TILE_H + 2) - tile.z * 8,
										zIndex: tile.z * 20 + tile.y,
										borderColor: selected ? "#FACC15" : hinted ? "#22D3EE" : mahjong.tileBorder,
										backgroundColor: mahjong.tile,
										transform: [{ translateY: selected || hinted ? -4 : 0 }],
									},
									(selected || hinted) && { borderWidth: 3 },
								]}
							>
								<Text style={[styles.mahjongText, { color: mahjong.text }]}>{tile.symbol}</Text>
								{/* A blocked tile is shaded, not made see-through, so the tiles under it never show through */}
								{!free && <View pointerEvents="none" style={styles.mahjongBlocked} />}
							</Pressable>
						);
					})}
			</View>
			</View>
			<View style={styles.controlRow}>
				<StylizedButton text={t("mahjong.undo")} onClick={() => {
					const last = history[history.length - 1];
					if (!last) return;
					setTiles(last);
					setHistory((current) => current.slice(0, -1));
					setSelectedId(null);
					clearHint();
				}} backgroundColor={cssColors.spaceGray} style={styles.resetButton} textStyle={styles.smallButtonText} />
				<StylizedButton text={t("mahjong.hint")} onClick={showHint} backgroundColor="#0E7490" style={styles.resetButton} textStyle={styles.smallButtonText} />
				<StylizedButton text={t("mahjong.shuffle")} onClick={() => {
					setHistory((current) => [...current, tiles]);
					setTiles((current) => shuffleMahjongTiles(current));
					setSelectedId(null);
				}} backgroundColor={currentTheme.buttonSecondary} style={styles.resetButton} textStyle={styles.smallButtonText} />
				<StylizedButton text={t("mahjong.new")} onClick={() => { setTiles(createMahjongTiles()); setSelectedId(null); clearHint(); setHistory([]); ratingSubmittedRef.current = false; }} backgroundColor={currentTheme.buttonPrimary} style={styles.resetButton} textStyle={styles.smallButtonText} />
			</View>
		</View>
	);
}