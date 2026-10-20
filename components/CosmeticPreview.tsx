import { StyleSheet, Text, View } from "react-native";
import type { ShopItem } from "@/constants/Shop";
import {
	CARD_SKINS,
	CHESS_BOARD_COLORS,
	CHESS_PIECE_COLORS,
	MAHJONG_THEMES,
	SEA_SKINS,
	SUDOKU_THEMES,
} from "./MoreGamesMenu";

// Little scenes that show a shop item the way it looks in its own game: the board and pieces for chess, a radar
// grid for Sea Battle, a card back and face, a sudoku board and a mahjong table. `large` is the version shown in
// the preview window before buying, the small one sits on the shop cards.

function keyOf(item: ShopItem): string {
	return item.id.slice(item.category.length + 1);
}

function pick<T extends Record<string, unknown>>(table: T, key: string): T[keyof T] {
	return (Object.prototype.hasOwnProperty.call(table, key) ? table[key] : Object.values(table)[0]) as T[keyof T];
}

export default function CosmeticPreview({ item, large = false }: { item: ShopItem; large?: boolean }) {
	const u = large ? 1.8 : 1;
	switch (item.category) {
		case "chess_piece":
			return <ChessPiecePreview item={item} u={u} />;
		case "chess_board":
			return <ChessBoardPreview item={item} u={u} />;
		case "sea_skin":
			return <SeaPreview item={item} u={u} />;
		case "card_skin":
			return <CardPreview item={item} u={u} />;
		case "sudoku_theme":
			return <SudokuPreview item={item} u={u} />;
		case "mahjong_theme":
			return <MahjongPreview item={item} u={u} />;
		default:
			return <BlockerinoPreview item={item} u={u} />;
	}
}

function Frame({ u, children, bg }: { u: number; children: React.ReactNode; bg?: string }) {
	return (
		<View style={[styles.frame, { height: 46 * u, borderRadius: 6 * Math.min(u, 1.4) }, bg ? { backgroundColor: bg } : null]}>
			{children}
		</View>
	);
}

function ChessBoardPreview({ item, u }: { item: ShopItem; u: number }) {
	const colors = pick(CHESS_BOARD_COLORS, keyOf(item));
	const cell = 11 * u;
	return (
		<Frame u={u}>
			<View style={styles.boardBorder}>
				{[0, 1, 2].map((row) => (
					<View key={row} style={{ flexDirection: "row" }}>
						{[0, 1, 2, 3, 4].map((col) => (
							<View key={col} style={{ width: cell, height: cell, backgroundColor: (row + col) % 2 === 0 ? colors.light : colors.dark }} />
						))}
					</View>
				))}
			</View>
		</Frame>
	);
}

function ChessPiecePreview({ item, u }: { item: ShopItem; u: number }) {
	const colors = pick(CHESS_PIECE_COLORS, keyOf(item));
	const board = CHESS_BOARD_COLORS.slate;
	const cell = 30 * u;
	const glyph = { fontSize: 24 * u, fontWeight: colors.heavy ? ("900" as const) : ("400" as const) };
	return (
		<Frame u={u}>
			<View style={{ flexDirection: "row" }}>
				<View style={[styles.cellCenter, { width: cell, height: cell, backgroundColor: board.light }]}>
					<Text style={[glyph, { color: colors.black, textShadowColor: "rgba(0,0,0,0.35)", textShadowRadius: 1 }]}>{"♞"}</Text>
				</View>
				<View style={[styles.cellCenter, { width: cell, height: cell, backgroundColor: board.dark }]}>
					<Text style={[glyph, { color: colors.white, textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 1 }]}>{"♞"}</Text>
				</View>
			</View>
		</Frame>
	);
}

function SeaPreview({ item, u }: { item: ShopItem; u: number }) {
	const sea = pick(SEA_SKINS, keyOf(item));
	const cell = 9 * u;
	const ship = sea.paper ? "#1E3A8A" : "#94A3B8";
	// 1 = ship, 2 = hit, 3 = miss
	const layout = [
		[0, 1, 1, 1, 0, 3],
		[0, 0, 0, 0, 0, 0],
		[3, 0, 2, 0, 1, 0],
		[0, 0, 2, 0, 1, 0],
	];
	return (
		<Frame u={u}>
			<View style={{ borderWidth: 2, borderColor: sea.gridBorder, backgroundColor: sea.gridBg }}>
				{layout.map((row, r) => (
					<View key={r} style={{ flexDirection: "row" }}>
						{row.map((value, c) => (
							<View
								key={c}
								style={{
									width: cell,
									height: cell,
									backgroundColor: value === 1 ? ship : value === 2 ? "#EF4444" : value === 3 ? sea.miss : sea.water,
									borderWidth: StyleSheet.hairlineWidth,
									borderColor: sea.cellBorder ?? "rgba(255,255,255,0.08)",
								}}
							/>
						))}
					</View>
				))}
			</View>
		</Frame>
	);
}

function CardPreview({ item, u }: { item: ShopItem; u: number }) {
	const skin = pick(CARD_SKINS, keyOf(item));
	const w = 24 * u;
	const h = 34 * u;
	return (
		<Frame u={u}>
			<View style={{ flexDirection: "row", gap: 6 * u }}>
				<View style={[styles.cardBase, { width: w, height: h, backgroundColor: skin.backBg, borderColor: skin.backBorder }]}>
					<Text style={{ color: skin.backGlyph, fontSize: 14 * u }}>{"◆"}</Text>
				</View>
				<View style={[styles.cardBase, { width: w, height: h, backgroundColor: skin.faceBg ?? "#FFFFFF", borderColor: skin.faceBorder ?? "#CBD5E1" }]}>
					<Text style={{ color: "#B91C1C", fontSize: 11 * u, fontFamily: "SilkscreenBold" }}>A</Text>
					<Text style={{ color: "#B91C1C", fontSize: 11 * u }}>{"♥"}</Text>
				</View>
			</View>
		</Frame>
	);
}

function SudokuPreview({ item, u }: { item: ShopItem; u: number }) {
	const theme = pick(SUDOKU_THEMES, keyOf(item));
	const cell = 12 * u;
	const digits = [5, 0, 3, 0, 7, 0, 1, 0, 8];
	const light = !theme.surface ? false : true;
	return (
		<Frame u={u} bg={theme.surface?.bg ?? "rgba(255,255,255,0.04)"}>
			<View style={{ borderWidth: 2, borderColor: theme.boardBorder, backgroundColor: theme.boardBg }}>
				{[0, 1, 2].map((r) => (
					<View key={r} style={{ flexDirection: "row" }}>
						{[0, 1, 2].map((c) => {
							const index = r * 3 + c;
							const selected = index === 4;
							return (
								<View
									key={c}
									style={[
										styles.cellCenter,
										{
											width: cell,
											height: cell,
											backgroundColor: selected ? theme.selected : theme.cellBg,
											borderWidth: StyleSheet.hairlineWidth * 2,
											borderColor: theme.cellBorder,
										},
									]}
								>
									{digits[index] > 0 && (
										<Text style={{ fontSize: 8 * u, fontFamily: "SilkscreenBold", color: ("given" in theme && theme.given) || (light ? "#5B2E14" : "#E2E8F0") }}>
											{digits[index]}
										</Text>
									)}
								</View>
							);
						})}
					</View>
				))}
			</View>
		</Frame>
	);
}

function MahjongPreview({ item, u }: { item: ShopItem; u: number }) {
	const theme = pick(MAHJONG_THEMES, keyOf(item));
	const glyphs = ["中", "發", "三"];
	return (
		<Frame u={u} bg={theme.board}>
			<View style={{ flexDirection: "row", gap: 3 * u }}>
				{glyphs.map((glyph, index) => (
					<View
						key={glyph}
						style={[
							styles.tile,
							{
								width: 17 * u,
								height: 24 * u,
								backgroundColor: theme.tile,
								borderColor: theme.tileBorder,
								marginTop: index === 1 ? -6 * u : 0,
							},
						]}
					>
						<Text style={{ color: theme.text, fontSize: 11 * u }}>{glyph}</Text>
					</View>
				))}
			</View>
		</Frame>
	);
}

// Blockerino's own cosmetics: block skins, backgrounds, music and sound effects.
function BlockerinoPreview({ item, u }: { item: ShopItem; u: number }) {
	if (item.category === "background" && item.gradient) {
		return (
			<View style={[styles.frame, { height: 46 * u, borderRadius: 6, overflow: "hidden" }]}>
				{item.gradient.map((color, index) => (
					<View key={`${item.id}-${index}`} style={{ flex: 1, width: "100%", backgroundColor: color }} />
				))}
			</View>
		);
	}
	if (item.category === "music") {
		return (
			<Frame u={u}>
				<View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6 * u }}>
					{item.previewColors.map((color, index) => (
						<View key={`${item.id}-${index}`} style={{ width: 11 * u, height: (12 + index * 8) * u, borderRadius: 4, backgroundColor: color }} />
					))}
				</View>
			</Frame>
		);
	}
	if (item.category === "sfx") {
		return (
			<Frame u={u}>
				<View style={{ flexDirection: "row", alignItems: "center", gap: 8 * u }}>
					{item.previewColors.map((color, index) => (
						<View key={`${item.id}-${index}`} style={{ width: 13 * u, height: 13 * u, borderRadius: 7 * u, backgroundColor: color, transform: [{ scale: 1 + index * 0.18 }] }} />
					))}
				</View>
			</Frame>
		);
	}
	const colors = item.previewColors.length > 0 ? item.previewColors : ["#888888"];
	return (
		<Frame u={u}>
			<View style={{ gap: 4 * u }}>
				{[0, 1].map((row) => (
					<View key={row} style={{ flexDirection: "row", gap: 4 * u }}>
						{[0, 1, 2, 3].map((col) => (
							<View
								key={col}
								style={{
									width: 16 * u,
									height: 16 * u,
									borderWidth: 3,
									borderColor: "rgba(255,255,255,0.24)",
									backgroundColor: colors[(row * 4 + col) % colors.length],
								}}
							/>
						))}
					</View>
				))}
			</View>
		</Frame>
	);
}

const styles = StyleSheet.create({
	frame: {
		width: "100%",
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.16)",
		backgroundColor: "rgba(255,255,255,0.04)",
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
	},
	boardBorder: {
		borderWidth: 2,
		borderColor: "rgba(255,255,255,0.3)",
	},
	cellCenter: {
		alignItems: "center",
		justifyContent: "center",
	},
	cardBase: {
		borderWidth: 2,
		borderRadius: 4,
		alignItems: "center",
		justifyContent: "center",
	},
	tile: {
		borderWidth: 2,
		borderRadius: 3,
		alignItems: "center",
		justifyContent: "center",
	},
});
