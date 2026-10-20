

// Cosmetic palettes of the More Games shop. Every shop item id (without its category prefix) has an entry here.
export const CHESS_BOARD_COLORS = {
	slate: { light: "#CBD5E1", dark: "#334155" },
	violet: { light: "#C4B5FD", dark: "#7C3AED" },
	walnut: { light: "#E8C99B", dark: "#8B5E34" },
	emerald: { light: "#EEEED2", dark: "#769656" },
	ice: { light: "#DEEAF6", dark: "#5B8DB8" },
	candy: { light: "#FCE7F3", dark: "#D9619A" },
} as const satisfies Record<string, { light: string; dark: string }>;

export const CHESS_PIECE_COLORS = {
	classic: { white: "#FFFFFF", black: "#111827", heavy: false },
	royal: { white: "#FDE047", black: "#111827", heavy: false },
	club: { white: "#E5E7EB", black: "#1F2937", heavy: true },
	neon: { white: "#67E8F9", black: "#581C87", heavy: false },
	ember: { white: "#FED7AA", black: "#7F1D1D", heavy: false },
	frost: { white: "#E0F2FE", black: "#1E3A8A", heavy: false },
} as const satisfies Record<string, { white: string; black: string; heavy: boolean }>;

export const MAHJONG_THEMES = {
	jade: { board: "#0F3A3E", boardBorder: "#2DD4BF", tile: "#ECFDF5", tileBorder: "#0F766E", text: "#047857" },
	ivory: { board: "#78350F", boardBorder: "#FED7AA", tile: "#FFF7ED", tileBorder: "#B45309", text: "#991B1B" },
	onyx: { board: "#0B0B10", boardBorder: "#FACC15", tile: "#1F2937", tileBorder: "#6B7280", text: "#FACC15" },
	ruby: { board: "#450A0A", boardBorder: "#F87171", tile: "#FEF2F2", tileBorder: "#B91C1C", text: "#B91C1C" },
	sakura: { board: "#4A1D3A", boardBorder: "#F9A8D4", tile: "#FDF2F8", tileBorder: "#BE185D", text: "#9D174D" },
} as const satisfies Record<string, { board: string; boardBorder: string; tile: string; tileBorder: string; text: string }>;

export const CARD_SKINS = {
	classic: { faceBg: null, faceBorder: null, backBg: "#1E40AF", backBorder: "#FFFFFF", backGlyph: "#60A5FA" },
	casino: { faceBg: "#F8FAFC", faceBorder: "#FACC15", backBg: "#B91C1C", backBorder: "#FACC15", backGlyph: "#FCA5A5" },
	midnight: { faceBg: "#F8FAFC", faceBorder: "#6366F1", backBg: "#111827", backBorder: "#6366F1", backGlyph: "#818CF8" },
	forest: { faceBg: "#F7FEE7", faceBorder: "#16A34A", backBg: "#14532D", backBorder: "#86EFAC", backGlyph: "#4ADE80" },
	sakura: { faceBg: "#FFF1F2", faceBorder: "#F472B6", backBg: "#BE185D", backBorder: "#FBCFE8", backGlyph: "#F9A8D4" },
} as const satisfies Record<string, { faceBg: string | null; faceBorder: string | null; backBg: string; backBorder: string; backGlyph: string }>;

export const SEA_SKINS = {
	navy: { paper: false, gridBg: "#082F49", gridBorder: "#38BDF8", water: "rgba(14,165,233,0.12)", miss: "#1E40AF", cellBorder: null },
	paper: { paper: true, gridBg: "#DBEAFE", gridBorder: "#1E3A8A", water: "rgba(255,255,255,0.32)", miss: "#CBD5E1", cellBorder: "#2563EB" },
	sonar: { paper: false, gridBg: "#022C22", gridBorder: "#34D399", water: "rgba(52,211,153,0.10)", miss: "#065F46", cellBorder: "rgba(52,211,153,0.35)" },
	sunset: { paper: false, gridBg: "#431407", gridBorder: "#FB923C", water: "rgba(251,146,60,0.14)", miss: "#9A3412", cellBorder: "rgba(251,146,60,0.4)" },
	blueprint: { paper: false, gridBg: "#1D4ED8", gridBorder: "#BFDBFE", water: "rgba(191,219,254,0.18)", miss: "#1E3A8A", cellBorder: "rgba(191,219,254,0.55)" },
} as const satisfies Record<string, { paper: boolean; gridBg: string; gridBorder: string; water: string; miss: string; cellBorder: string | null }>;

export interface SudokuPalette {
	surface: { bg: string; border: string } | null;
	boardBorder: string;
	boardBg: string;
	cellBorder: string;
	cellBg: string;
	cellShadow: string | null;
	related: string;
	selected: string;
	/** Colours left undefined fall back to the app theme (the dark themes). */
	status?: string;
	given?: string;
	entry?: string;
	notes?: string;
	tile: { bg: string; border: string } | null;
	tileText?: string;
}

export const SUDOKU_THEMES = {
	wood: {
		surface: { bg: "#D8A868", border: "#7C2D12" }, boardBorder: "#5B2E14", boardBg: "#B77C43", cellBorder: "#7C2D12", cellBg: "#F6D7B0",
		cellShadow: "#7C2D12", related: "#E9C99A", selected: "#FACC15", status: "#5B2E14", given: "#5B2E14", entry: "#7C2D12", notes: "#8B5E34",
		tile: { bg: "#F6D7B0", border: "#7C2D12" }, tileText: "#5B2E14",
	},
	night: {
		surface: null, boardBorder: "#94A3B8", boardBg: "#020617", cellBorder: "#475569", cellBg: "#111827", cellShadow: null,
		related: "rgba(96,165,250,0.16)", selected: "#334155", tile: null,
	},
	mint: {
		surface: { bg: "#BBF7D0", border: "#166534" }, boardBorder: "#14532D", boardBg: "#16A34A", cellBorder: "#166534", cellBg: "#F0FDF4",
		cellShadow: null, related: "#DCFCE7", selected: "#FDE047", status: "#14532D", given: "#14532D", entry: "#0F766E", notes: "#4D7C0F",
		tile: { bg: "#F0FDF4", border: "#166534" }, tileText: "#14532D",
	},
	ocean: {
		surface: { bg: "#BAE6FD", border: "#075985" }, boardBorder: "#0C4A6E", boardBg: "#0284C7", cellBorder: "#075985", cellBg: "#F0F9FF",
		cellShadow: null, related: "#E0F2FE", selected: "#FDE047", status: "#0C4A6E", given: "#0C4A6E", entry: "#1D4ED8", notes: "#0369A1",
		tile: { bg: "#F0F9FF", border: "#075985" }, tileText: "#0C4A6E",
	},
	neon: {
		surface: null, boardBorder: "#22D3EE", boardBg: "#050816", cellBorder: "#155E75", cellBg: "#0B1220", cellShadow: null,
		related: "rgba(34,211,238,0.14)", selected: "#164E63", entry: "#22D3EE", notes: "#67E8F9", tile: null,
	},
} as const satisfies Record<string, SudokuPalette>;

export interface ExtraGameCosmetics {
	chessPieces: keyof typeof CHESS_PIECE_COLORS;
	chessBoard: keyof typeof CHESS_BOARD_COLORS;
	sudokuTheme: keyof typeof SUDOKU_THEMES;
	mahjongTheme: keyof typeof MAHJONG_THEMES;
	cardSkin: keyof typeof CARD_SKINS;
	seaSkin: keyof typeof SEA_SKINS;
}

/** Resolves an equipped shop item id to a palette key, falling back when the id is missing or unknown. */
export function pickCosmetic<T extends Record<string, unknown>>(palettes: T, itemId: string | undefined, prefix: string, fallback: keyof T): keyof T {
	const key = itemId?.startsWith(prefix) ? itemId.slice(prefix.length) : itemId;
	return key !== undefined && Object.prototype.hasOwnProperty.call(palettes, key) ? key as keyof T : fallback;
}

export const DEFAULT_EXTRA_COSMETICS: ExtraGameCosmetics = {
	chessPieces: "royal",
	chessBoard: "violet",
	sudokuTheme: "wood",
	mahjongTheme: "jade",
	cardSkin: "classic",
	seaSkin: "paper",
};