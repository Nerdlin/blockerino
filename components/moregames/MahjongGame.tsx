import { useState, useRef, useEffect, useMemo } from "react";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { submitMoreGameSoloResult } from "@/constants/Supabase";
import { View, Text, Pressable } from "react-native";
import StylizedButton from "../StylizedButton";
import { cssColors } from "@/constants/Color";
import { MahjongTile } from "./types";
import { shuffleInPlace } from "./SudokuGame";
import { ExtraGameCosmetics, MAHJONG_THEMES } from "./cosmetics";
import { styles } from "./styles";

export const MAHJONG_SYMBOLS = ["一", "二", "三", "竹", "花", "中", "發", "東", "南", "北", "白", "九", "萬", "風", "春", "月", "山", "水"];
export const MAHJONG_LAYOUT = [
	[0, 2, 0], [1, 2, 0], [2, 2, 0], [3, 2, 0], [4, 2, 0], [5, 2, 0],
	[0, 3, 0], [1, 3, 0], [2, 3, 0], [3, 3, 0], [4, 3, 0], [5, 3, 0],
	[1, 1, 0], [2, 1, 0], [3, 1, 0], [4, 1, 0],
	[1, 4, 0], [2, 4, 0], [3, 4, 0], [4, 4, 0],
	[2, 0, 0], [3, 0, 0], [2, 5, 0], [3, 5, 0],
	[2, 2, 1], [3, 2, 1], [2, 3, 1], [3, 3, 1],
	[1, 2, 1], [4, 2, 1], [1, 3, 1], [4, 3, 1],
	[2, 2, 2], [3, 2, 2], [2, 3, 2], [3, 3, 2],
];

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
	const [boardWidth, setBoardWidth] = useState(370);
	const boardScale = Math.min(1, boardWidth / 370);
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const [tiles, setTiles] = useState(createMahjongTiles);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [history, setHistory] = useState<MahjongTile[][]>([]);
	const ratingSubmittedRef = useRef(false);
	const remaining = tiles.filter((tile) => !tile.removed).length;
	const mahjong = MAHJONG_THEMES[cosmetics.mahjongTheme];

	useEffect(() => {
		if (remaining !== 0 || ratingSubmittedRef.current) return;
		ratingSubmittedRef.current = true;
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

	const pickTile = (id: string) => {
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
			<View onLayout={(event) => setBoardWidth(event.nativeEvent.layout.width)} style={{ width: '100%', height: 360 * boardScale, alignItems: 'center' }}>
			<View style={[styles.mahjongLayerBoard, { backgroundColor: mahjong.board, borderColor: mahjong.boardBorder }, { position: 'absolute', left: Math.max(0, (boardWidth - 370) / 2), transformOrigin: 'top left', transform: [{ scale: boardScale }] }]}>
				{tiles.map((tile) => {
					if (tile.removed) return null;
					const free = isMahjongTileFree(tile, tiles);
					const selected = selectedId === tile.id;
					const hinted = freePairs.includes(tile.id);
					return (
						<Pressable
							key={tile.id}
							onPress={() => pickTile(tile.id)}
							style={[
								styles.mahjongLayerTile,
								{
									left: 20 + tile.x * 51 + tile.z * 7,
									top: 10 + tile.y * 56 - tile.z * 10,
									zIndex: tile.z * 20 + tile.y,
									opacity: free ? 1 : 0.58,
									borderColor: selected ? "#FACC15" : hinted ? "#22D3EE" : mahjong.tileBorder,
									backgroundColor: mahjong.tile,
								},
							]}
						>
							<Text style={[styles.mahjongText, { color: mahjong.text }]}>{tile.symbol}</Text>
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
				}} backgroundColor={cssColors.spaceGray} style={styles.resetButton} textStyle={styles.smallButtonText} />
				<StylizedButton text={t("mahjong.shuffle")} onClick={() => {
					setHistory((current) => [...current, tiles]);
					setTiles((current) => shuffleMahjongTiles(current));
					setSelectedId(null);
				}} backgroundColor={currentTheme.buttonSecondary} style={styles.resetButton} textStyle={styles.smallButtonText} />
				<StylizedButton text={t("mahjong.new")} onClick={() => { setTiles(createMahjongTiles()); setSelectedId(null); setHistory([]); ratingSubmittedRef.current = false; }} backgroundColor={currentTheme.buttonPrimary} style={styles.resetButton} textStyle={styles.smallButtonText} />
			</View>
		</View>
	);
}