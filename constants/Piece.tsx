import { Color, colorToHex } from "./Color";

export interface PieceData {
	matrix: number[][];
	distributionPoints: number;
	color: Color;
}

// same as piecedata but with no color
// this is because color is random each time
// so we will use this one to store piece shape and info
interface PieceDataSaved {
	matrix: number[][];
	distributionPoints: number
}

export const piecesData: PieceDataSaved[] = [
	// L-shape
	{
		matrix: [
			[1, 0, 0],
			[1, 1, 1],
		],
		distributionPoints: 2,

	},
	{
		matrix: [
			[1, 1],
			[1, 0],
			[1, 0],
		],
		distributionPoints: 2,

	},
	{
		matrix: [
			[1, 1, 1],
			[0, 0, 1],
		],
		distributionPoints: 2,

	},
	{
		matrix: [
			[0, 1],
			[0, 1],
			[1, 1],
		],
		distributionPoints: 2,

	},
	{
		matrix: [
			[0, 0, 1],
			[1, 1, 1],
		],
		distributionPoints: 2,

	},
	{
		matrix: [
			[1, 0],
			[1, 0],
			[1, 1],
		],
		distributionPoints: 2,

	},
	{
		matrix: [
			[1, 1, 1],
			[1, 0, 0],
		],
		distributionPoints: 2,

	},
	{
		matrix: [
			[1, 1],
			[0, 1],
			[0, 1],
		],
		distributionPoints: 2,

	},
	// Triangle shape
	{
		matrix: [
			[1, 1, 1],
			[0, 1, 0],
		],
		distributionPoints: 1.5,

	},
	{
		matrix: [
			[1, 0],
			[1, 1],
			[1, 0],
		],
		distributionPoints: 1.5,

	},
	{
		matrix: [
			[0, 1, 0],
			[1, 1, 1],
		],
		distributionPoints: 1.5,

	},
	{
		matrix: [
			[0, 1],
			[1, 1],
			[0, 1],
		],
		distributionPoints: 1.5,

	},
	// Z/S shape
	{
		matrix: [
			[0, 1, 1],
			[1, 1, 0],
		],
		distributionPoints: 1,

	},
	{
		matrix: [
			[1, 0],
			[1, 1],
			[0, 1],
		],
		distributionPoints: 1,

	},
	{
		matrix: [
			[1, 1, 0],
			[0, 1, 1],
		],
		distributionPoints: 1,

	},
	{
		matrix: [
			[0, 1],
			[1, 1],
			[1, 0],
		],
		distributionPoints: 1,

	},
	// 3x3
	{
		matrix: [
			[1, 1, 1],
			[1, 1, 1],
			[1, 1, 1],
		],
		distributionPoints: 3,

	},
	// 2x2
	{
		matrix: [
			[1, 1],
			[1, 1],
		],
		distributionPoints: 6,

	},
	// 4x1
	{
		matrix: [
			[1],
			[1],
			[1],
			[1],
		],
		distributionPoints: 2,
	},
	// 1x4
	{
		matrix: [
			[1, 1, 1, 1],
		],
		distributionPoints: 2,
	},
	// 3x1
	{
		matrix: [
			[1],
			[1],
			[1],
		],
		distributionPoints: 4,
	},
	// 1x3
	{
		matrix: [
			[1, 1, 1],
		],
		distributionPoints: 4,
	},
	// 2x1
	{
		matrix: [
			[1],
			[1],
		],
		distributionPoints: 2,
	},
	// 1x2
	{
		matrix: [
			[1, 1],
		],
		distributionPoints: 2,
	},
	// 1x1 (Single block)
	{
		matrix: [
			[1],
		],
		distributionPoints: 6,
	},
	// Corner 2x2 (L-shape with 3 blocks)
	{
		matrix: [
			[1, 1],
			[1, 0],
		],
		distributionPoints: 4,
	},
	{
		matrix: [
			[1, 1],
			[0, 1],
		],
		distributionPoints: 4,
	},
	{
		matrix: [
			[1, 0],
			[1, 1],
		],
		distributionPoints: 4,
	},
	{
		matrix: [
			[0, 1],
			[1, 1],
		],
		distributionPoints: 4,
	},
	// Big L-shape 3x3 (5 blocks)
	{
		matrix: [
			[1, 0, 0],
			[1, 0, 0],
			[1, 1, 1],
		],
		distributionPoints: 2,
	},
	{
		matrix: [
			[1, 1, 1],
			[1, 0, 0],
			[1, 0, 0],
		],
		distributionPoints: 2,
	},
	{
		matrix: [
			[1, 1, 1],
			[0, 0, 1],
			[0, 0, 1],
		],
		distributionPoints: 2,
	},
	{
		matrix: [
			[0, 0, 1],
			[0, 0, 1],
			[1, 1, 1],
		],
		distributionPoints: 2,
	},
	// U-shape 3x2 (5 blocks)
	{
		matrix: [
			[1, 0, 1],
			[1, 1, 1],
		],
		distributionPoints: 1.5,
	},
	{
		matrix: [
			[1, 1, 1],
			[1, 0, 1],
		],
		distributionPoints: 1.5,
	},
	{
		matrix: [
			[1, 1],
			[1, 0],
			[1, 1],
		],
		distributionPoints: 1.5,
	},
	{
		matrix: [
			[1, 1],
			[0, 1],
			[1, 1],
		],
		distributionPoints: 1.5,
	},
	// Plus/Cross shape 3x3 (5 blocks)
	{
		matrix: [
			[0, 1, 0],
			[1, 1, 1],
			[0, 1, 0],
		],
		distributionPoints: 1.5,
	},
	// 5x1 and 1x5 long lines
	{
		matrix: [
			[1],
			[1],
			[1],
			[1],
			[1],
		],
		distributionPoints: 1.5,
	},
	{
		matrix: [
			[1, 1, 1, 1, 1],
		],
		distributionPoints: 1.5,
	},
	// Big T-shape 3x3 (5 blocks)
	{
		matrix: [
			[1, 1, 1],
			[0, 1, 0],
			[0, 1, 0],
		],
		distributionPoints: 1.0,
	},
	{
		matrix: [
			[0, 1, 0],
			[0, 1, 0],
			[1, 1, 1],
		],
		distributionPoints: 1.0,
	},
	{
		matrix: [
			[1, 0, 0],
			[1, 1, 1],
			[1, 0, 0],
		],
		distributionPoints: 1.0,
	},
	{
		matrix: [
			[0, 0, 1],
			[1, 1, 1],
			[0, 0, 1],
		],
		distributionPoints: 1.0,
	},
	// C-shape/Bracket 3x3 (5 blocks)
	{
		matrix: [
			[1, 1, 1],
			[1, 0, 0],
			[1, 1, 1],
		],
		distributionPoints: 1.0,
	},
	{
		matrix: [
			[1, 1, 1],
			[0, 0, 1],
			[1, 1, 1],
		],
		distributionPoints: 1.0,
	},
	{
		matrix: [
			[1, 1, 1],
			[1, 0, 1],
			[1, 0, 1],
		],
		distributionPoints: 1.0,
	},
	{
		matrix: [
			[1, 0, 1],
			[1, 0, 1],
			[1, 1, 1],
		],
		distributionPoints: 1.0,
	},
	// Diagonal / stairs (3 blocks)
	{
		matrix: [
			[1, 0, 0],
			[0, 1, 0],
			[0, 0, 1],
		],
		distributionPoints: 1.5,
	},
	{
		matrix: [
			[0, 0, 1],
			[0, 1, 0],
			[1, 0, 0],
		],
		distributionPoints: 1.5,
	},
	// Diagonal Z-shape (5 blocks)
	{
		matrix: [
			[1, 1, 0],
			[0, 1, 0],
			[0, 1, 1],
		],
		distributionPoints: 1.0,
	},
	{
		matrix: [
			[0, 1, 1],
			[0, 1, 0],
			[1, 1, 0],
		],
		distributionPoints: 1.0,
	},
];

export const pieceColors = [
	{ r: 227, g: 143, b: 16 },
	{ r: 186, g: 19, b: 38 },
	{ r: 16, g: 158, b: 40 },
	{ r: 20, g: 56, b: 184 },
	{ r: 101, g: 19, b: 148 },
	{ r: 31, g: 165, b: 222 }
]

export function getBlockCount(piece: PieceData): number {
	"worklet";
	let count = 0;
	for (let y = 0; y < piece.matrix.length; y++) {
		for (let x = 0; x < piece.matrix[0].length; x++) {
			if (piece.matrix[y][x] === 1)
				count++;
		}
	}
	return count;
}

export const bombPiecesData = [
	{
		matrix: [
			[2],
		],
		distributionPoints: 1.0,
	},
	{
		matrix: [
			[2, 2],
			[2, 2],
		],
		distributionPoints: 0.5,
	}
];

const CLASSIC_MODE = 'classic';

function getMatrixBlockCount(matrix: number[][]): number {
	"worklet";
	let count = 0;
	for (let y = 0; y < matrix.length; y++) {
		for (let x = 0; x < matrix[0].length; x++) {
			if (matrix[y][x] === 1)
				count++;
		}
	}
	return count;
}

function isSmallCornerPiece(matrix: number[][]): boolean {
	"worklet";
	return matrix.length === 2 && matrix[0].length === 2 && getMatrixBlockCount(matrix) === 3;
}

function isThreeBlockDiagonal(matrix: number[][]): boolean {
	"worklet";
	if (matrix.length !== 3 || matrix[0].length !== 3 || getMatrixBlockCount(matrix) !== 3) {
		return false;
	}
	return (
		(matrix[0][0] === 1 && matrix[1][1] === 1 && matrix[2][2] === 1) ||
		(matrix[0][2] === 1 && matrix[1][1] === 1 && matrix[2][0] === 1)
	);
}

export function isClassicRescuePiece(piece: Pick<PieceData, 'matrix'>): boolean {
	"worklet";
	const matrix = piece.matrix;
	const height = matrix.length;
	const width = matrix[0].length;
	const blockCount = getMatrixBlockCount(matrix);

	return (
		blockCount === 1 ||
		(blockCount === 2 && (width === 1 || height === 1)) ||
		(blockCount === 3 && (width === 1 || height === 1)) ||
		isSmallCornerPiece(matrix)
	);
}

export function isClassicComplexPiece(piece: Pick<PieceData, 'matrix'>): boolean {
	"worklet";
	const matrix = piece.matrix;
	const height = matrix.length;
	const width = matrix[0].length;
	const blockCount = getMatrixBlockCount(matrix);

	return (
		blockCount >= 5 ||
		width >= 5 ||
		height >= 5 ||
		isThreeBlockDiagonal(matrix)
	);
}

function getDistributionPointsForMode(piece: PieceDataSaved, gameMode?: string): number {
	"worklet";
	if (gameMode !== CLASSIC_MODE || !isClassicComplexPiece(piece)) {
		return piece.distributionPoints;
	}
	return Math.max(0.25, piece.distributionPoints * 0.25);
}

function chooseWeightedPiece(gameMode?: string, rescueOnly: boolean = false, excludeComplex: boolean = false): PieceDataSaved {
	"worklet";
	let total = 0;
	for (let i = 0; i < piecesData.length; i++) {
		const piece = piecesData[i];
		if (rescueOnly && !isClassicRescuePiece(piece)) {
			continue;
		}
		if (excludeComplex && isClassicComplexPiece(piece)) {
			continue;
		}
		total += getDistributionPointsForMode(piece, gameMode);
	}

	let position = Math.random() * total;
	for (let i = 0; i < piecesData.length; i++) {
		const piece = piecesData[i];
		if (rescueOnly && !isClassicRescuePiece(piece)) {
			continue;
		}
		if (excludeComplex && isClassicComplexPiece(piece)) {
			continue;
		}
		position -= getDistributionPointsForMode(piece, gameMode);
		if (position < 0) {
			return piece;
		}
	}

	return piecesData[piecesData.length - 1];
}

export function getRandomPieceColor(): Color {
	return pieceColors[Math.floor(Math.random() * pieceColors.length)];
}

export function getRandomPieceColorWorklet(): Color {
	"worklet";
	return pieceColors[Math.floor(Math.random() * pieceColors.length)];
}

export function getRandomPiece(gameMode?: string, rescueOnly: boolean = false, excludeComplex: boolean = false): PieceData {
	const piece = chooseWeightedPiece(gameMode, rescueOnly, excludeComplex);
	return {
		...piece,
		color: getRandomPieceColor()
	};
}

export function getRandomPieceWorklet(gameMode?: string, rescueOnly: boolean = false, excludeComplex: boolean = false): PieceData {
	"worklet";
	const piece = chooseWeightedPiece(gameMode, rescueOnly, excludeComplex);
	return {
		...piece,
		color: getRandomPieceColorWorklet()
	};
}

function getPieceColorPaletteIndex(color: Color): number {
	"worklet";
	let closestIndex = 0;
	let closestDistance = Number.MAX_SAFE_INTEGER;
	for (let i = 0; i < pieceColors.length; i++) {
		const candidate = pieceColors[i];
		const distance =
			Math.abs(candidate.r - color.r) +
			Math.abs(candidate.g - color.g) +
			Math.abs(candidate.b - color.b);
		if (distance < closestDistance) {
			closestDistance = distance;
			closestIndex = i;
		}
	}
	return closestIndex;
}

function getPieceSkinFamily(pieceSkinId: string): string {
	"worklet";
	if (pieceSkinId.startsWith("piece_minecraft")) return "piece_minecraft";
	if (pieceSkinId.startsWith("piece_crystal")) return "piece_crystal";
	if (pieceSkinId.startsWith("piece_lava")) return "piece_lava";
	if (pieceSkinId.startsWith("piece_circuit")) return "piece_circuit";
	return "piece_classic";
}

function getExactPieceSkinPalette(pieceSkinId: string): Color[] | null {
	"worklet";
	switch (pieceSkinId) {
		case "piece_paper_cut":
			return [
				{ r: 253, g: 230, b: 138 },
				{ r: 255, g: 255, b: 255 },
				{ r: 17, g: 24, b: 39 },
				{ r: 251, g: 191, b: 36 },
				{ r: 229, g: 231, b: 235 },
				{ r: 55, g: 65, b: 81 },
			];
		case "piece_ocean_shell":
			return [
				{ r: 15, g: 118, b: 110 },
				{ r: 45, g: 212, b: 191 },
				{ r: 251, g: 113, b: 133 },
				{ r: 14, g: 165, b: 233 },
				{ r: 6, g: 95, b: 70 },
				{ r: 253, g: 164, b: 175 },
			];
		case "piece_monochrome":
			return [
				{ r: 17, g: 24, b: 39 },
				{ r: 107, g: 114, b: 128 },
				{ r: 248, g: 250, b: 252 },
				{ r: 31, g: 41, b: 55 },
				{ r: 156, g: 163, b: 175 },
				{ r: 229, g: 231, b: 235 },
			];
		case "piece_candy_pop":
			return [
				{ r: 249, g: 168, b: 212 },
				{ r: 253, g: 224, b: 71 },
				{ r: 56, g: 189, b: 248 },
				{ r: 251, g: 113, b: 133 },
				{ r: 167, g: 243, b: 208 },
				{ r: 216, g: 180, b: 254 },
			];
		case "piece_shadow_gold":
			return [
				{ r: 2, g: 6, b: 23 },
				{ r: 133, g: 77, b: 14 },
				{ r: 250, g: 204, b: 21 },
				{ r: 17, g: 24, b: 39 },
				{ r: 161, g: 98, b: 7 },
				{ r: 254, g: 240, b: 138 },
			];
		case "piece_forest_mushroom":
			return [
				{ r: 54, g: 83, b: 20 },
				{ r: 163, g: 230, b: 53 },
				{ r: 220, g: 38, b: 38 },
				{ r: 22, g: 101, b: 52 },
				{ r: 132, g: 204, b: 22 },
				{ r: 127, g: 29, b: 29 },
			];
		case "piece_aurora_glass":
			return [
				{ r: 34, g: 211, b: 238 },
				{ r: 167, g: 139, b: 250 },
				{ r: 74, g: 222, b: 128 },
				{ r: 192, g: 132, b: 252 },
				{ r: 45, g: 212, b: 191 },
				{ r: 147, g: 197, b: 253 },
			];
		case "piece_neon_fruit":
			return [
				{ r: 251, g: 113, b: 133 },
				{ r: 250, g: 204, b: 21 },
				{ r: 74, g: 222, b: 128 },
				{ r: 249, g: 115, b: 22 },
				{ r: 236, g: 72, b: 153 },
				{ r: 163, g: 230, b: 53 },
			];
		case "piece_ink_stamp":
			return [
				{ r: 17, g: 24, b: 39 },
				{ r: 229, g: 231, b: 235 },
				{ r: 239, g: 68, b: 68 },
				{ r: 55, g: 65, b: 81 },
				{ r: 248, g: 250, b: 252 },
				{ r: 185, g: 28, b: 28 },
			];
		case "piece_cosmic_ore":
			return [
				{ r: 15, g: 23, b: 42 },
				{ r: 147, g: 197, b: 253 },
				{ r: 196, g: 181, b: 253 },
				{ r: 30, g: 41, b: 59 },
				{ r: 125, g: 211, b: 252 },
				{ r: 216, g: 180, b: 254 },
			];
		case "piece_moonstone":
			return [
				{ r: 17, g: 24, b: 39 },
				{ r: 196, g: 181, b: 253 },
				{ r: 224, g: 242, b: 254 },
				{ r: 99, g: 102, b: 241 },
				{ r: 148, g: 163, b: 184 },
				{ r: 221, g: 214, b: 254 },
			];
		case "piece_jade_tile":
			return [
				{ r: 6, g: 78, b: 59 },
				{ r: 52, g: 211, b: 153 },
				{ r: 167, g: 243, b: 208 },
				{ r: 21, g: 128, b: 61 },
				{ r: 134, g: 239, b: 172 },
				{ r: 15, g: 118, b: 110 },
			];
		case "piece_ruby_cut":
			return [
				{ r: 69, g: 10, b: 10 },
				{ r: 220, g: 38, b: 38 },
				{ r: 251, g: 113, b: 133 },
				{ r: 153, g: 27, b: 27 },
				{ r: 248, g: 113, b: 113 },
				{ r: 253, g: 164, b: 175 },
			];
		case "piece_sapphire_cut":
			return [
				{ r: 15, g: 23, b: 42 },
				{ r: 37, g: 99, b: 235 },
				{ r: 147, g: 197, b: 253 },
				{ r: 30, g: 64, b: 175 },
				{ r: 96, g: 165, b: 250 },
				{ r: 186, g: 230, b: 253 },
			];
		case "piece_topaz_tile":
			return [
				{ r: 69, g: 26, b: 3 },
				{ r: 217, g: 119, b: 6 },
				{ r: 251, g: 191, b: 36 },
				{ r: 180, g: 83, b: 9 },
				{ r: 253, g: 186, b: 116 },
				{ r: 254, g: 240, b: 138 },
			];
		case "piece_ghost_ink":
			return [
				{ r: 17, g: 24, b: 39 },
				{ r: 100, g: 116, b: 139 },
				{ r: 229, g: 231, b: 235 },
				{ r: 30, g: 41, b: 59 },
				{ r: 148, g: 163, b: 184 },
				{ r: 221, g: 214, b: 254 },
			];
		case "piece_radioactive":
			return [
				{ r: 26, g: 46, b: 5 },
				{ r: 101, g: 163, b: 13 },
				{ r: 217, g: 249, b: 157 },
				{ r: 77, g: 124, b: 15 },
				{ r: 190, g: 242, b: 100 },
				{ r: 34, g: 197, b: 94 },
			];
		case "piece_storm_cloud":
			return [
				{ r: 15, g: 23, b: 42 },
				{ r: 71, g: 85, b: 105 },
				{ r: 186, g: 230, b: 253 },
				{ r: 30, g: 41, b: 59 },
				{ r: 148, g: 163, b: 184 },
				{ r: 147, g: 197, b: 253 },
			];
		case "piece_pearl_shell":
			return [
				{ r: 131, g: 24, b: 67 },
				{ r: 251, g: 207, b: 232 },
				{ r: 224, g: 242, b: 254 },
				{ r: 253, g: 164, b: 175 },
				{ r: 221, g: 214, b: 254 },
				{ r: 255, g: 255, b: 255 },
			];
		case "piece_arcade_gum":
			return [
				{ r: 131, g: 24, b: 67 },
				{ r: 244, g: 114, b: 182 },
				{ r: 34, g: 211, b: 238 },
				{ r: 250, g: 204, b: 21 },
				{ r: 192, g: 132, b: 252 },
				{ r: 45, g: 212, b: 191 },
			];
		case "piece_desert_clay":
			return [
				{ r: 67, g: 20, b: 7 },
				{ r: 180, g: 83, b: 9 },
				{ r: 253, g: 186, b: 116 },
				{ r: 124, g: 45, b: 18 },
				{ r: 234, g: 88, b: 12 },
				{ r: 253, g: 230, b: 138 },
			];
		case "piece_night_market":
			return [
				{ r: 17, g: 24, b: 39 },
				{ r: 190, g: 18, b: 60 },
				{ r: 250, g: 204, b: 21 },
				{ r: 88, g: 28, b: 135 },
				{ r: 34, g: 211, b: 238 },
				{ r: 251, g: 113, b: 133 },
			];
		case "piece_laser_grid":
			return [
				{ r: 2, g: 6, b: 23 },
				{ r: 34, g: 211, b: 238 },
				{ r: 239, g: 68, b: 68 },
				{ r: 99, g: 102, b: 241 },
				{ r: 244, g: 114, b: 182 },
				{ r: 163, g: 230, b: 53 },
			];
		case "piece_snow_mint":
			return [
				{ r: 6, g: 78, b: 59 },
				{ r: 167, g: 243, b: 208 },
				{ r: 255, g: 255, b: 255 },
				{ r: 94, g: 234, b: 212 },
				{ r: 186, g: 230, b: 253 },
				{ r: 240, g: 253, b: 250 },
			];
		case "piece_copper_wire":
			return [
				{ r: 28, g: 10, b: 0 },
				{ r: 249, g: 115, b: 22 },
				{ r: 20, g: 184, b: 166 },
				{ r: 146, g: 64, b: 14 },
				{ r: 253, g: 186, b: 116 },
				{ r: 45, g: 212, b: 191 },
			];
		case "piece_royal_velvet":
			return [
				{ r: 46, g: 16, b: 101 },
				{ r: 126, g: 34, b: 206 },
				{ r: 253, g: 224, b: 71 },
				{ r: 88, g: 28, b: 135 },
				{ r: 192, g: 132, b: 252 },
				{ r: 251, g: 207, b: 232 },
			];
		case "piece_magma_ice":
			return [
				{ r: 127, g: 29, b: 29 },
				{ r: 249, g: 115, b: 22 },
				{ r: 56, g: 189, b: 248 },
				{ r: 186, g: 230, b: 253 },
				{ r: 220, g: 38, b: 38 },
				{ r: 254, g: 240, b: 138 },
			];
		case "piece_lime_shadow":
			return [
				{ r: 2, g: 6, b: 23 },
				{ r: 63, g: 98, b: 18 },
				{ r: 190, g: 242, b: 100 },
				{ r: 26, g: 46, b: 5 },
				{ r: 163, g: 230, b: 53 },
				{ r: 229, g: 231, b: 235 },
			];
		case "piece_peach_soda":
			return [
				{ r: 124, g: 45, b: 18 },
				{ r: 253, g: 186, b: 116 },
				{ r: 249, g: 168, b: 212 },
				{ r: 251, g: 113, b: 133 },
				{ r: 254, g: 240, b: 138 },
				{ r: 224, g: 242, b: 254 },
			];
		case "piece_void_pearl":
			return [
				{ r: 3, g: 0, b: 20 },
				{ r: 109, g: 40, b: 217 },
				{ r: 221, g: 214, b: 254 },
				{ r: 49, g: 46, b: 129 },
				{ r: 196, g: 181, b: 253 },
				{ r: 224, g: 242, b: 254 },
			];
		default:
			return null;
	}
}

function getPieceSkinColor(color: Color, pieceSkinId: string = "piece_classic"): Color {
	"worklet";
	const exactPalette = getExactPieceSkinPalette(pieceSkinId);
	if (exactPalette) {
		const index = getPieceColorPaletteIndex(color);
		return exactPalette[index % exactPalette.length];
	}

	const skinFamily = getPieceSkinFamily(pieceSkinId);
	if (skinFamily === "piece_classic") {
		return color;
	}

	const index = getPieceColorPaletteIndex(color);
	const palettes: Record<string, Color[]> = {
		piece_minecraft: [
			{ r: 107, g: 191, b: 69 },
			{ r: 138, g: 90, b: 43 },
			{ r: 128, g: 128, b: 128 },
			{ r: 44, g: 206, b: 210 },
			{ r: 52, g: 111, b: 42 },
			{ r: 217, g: 184, b: 93 },
		],
		piece_crystal: [
			{ r: 125, g: 235, b: 255 },
			{ r: 199, g: 125, b: 255 },
			{ r: 255, g: 125, b: 221 },
			{ r: 141, g: 255, b: 178 },
			{ r: 116, g: 159, b: 255 },
			{ r: 255, g: 245, b: 153 },
		],
		piece_lava: [
			{ r: 255, g: 176, b: 0 },
			{ r: 255, g: 77, b: 0 },
			{ r: 139, g: 30, b: 0 },
			{ r: 58, g: 11, b: 0 },
			{ r: 255, g: 213, b: 74 },
			{ r: 178, g: 48, b: 12 },
		],
		piece_circuit: [
			{ r: 0, g: 255, b: 157 },
			{ r: 0, g: 212, b: 255 },
			{ r: 77, g: 91, b: 255 },
			{ r: 213, g: 255, b: 63 },
			{ r: 20, g: 255, b: 238 },
			{ r: 255, g: 45, b: 214 },
		],
	};

	const palette = palettes[skinFamily];
	if (!palette) {
		return color;
	}
	return palette[index % palette.length];
}

function getBorderColors(backgroundColor: Color) {
	"worklet";
	const { r, g, b } = backgroundColor;

	// multipliers calculated from a screenshot
	const multipliers = {
		borderTopColor: { r: 214 / 131, g: 167 / 83, b: 247 / 203 },
		borderLeftColor: { r: 164 / 131, g: 119 / 83, b: 224 / 203 },
		borderRightColor: { r: 123 / 131, g: 69 / 83, b: 153 / 203 },
		borderBottomColor: { r: 92 / 131, g: 43 / 83, b: 132 / 203 }
	};

	const clamp = (value: number) => Math.min(Math.max(Math.round(value), 0), 255);

	const computeColor = (mult: any) =>
		`rgb(${clamp(r * mult.r)}, ${clamp(g * mult.g)}, ${clamp(b * mult.b)})`;

	return {
		borderTopColor: computeColor(multipliers.borderTopColor),
		borderLeftColor: computeColor(multipliers.borderLeftColor),
		borderRightColor: computeColor(multipliers.borderRightColor),
		borderBottomColor: computeColor(multipliers.borderBottomColor)
	};
}

export function createFilledBlockStyle(color: Color, borderWidth: number = 7, pieceSkinId: string = "piece_classic"): object {
	"worklet";
	const skinFamily = getPieceSkinFamily(pieceSkinId);
	const hasExactPalette = getExactPieceSkinPalette(pieceSkinId) !== null;
	const skinColor = getPieceSkinColor(color, pieceSkinId);
	let finalBorderWidth = borderWidth;
	let borderRadius = 0;
	let shadow = "none";

	if (skinFamily === "piece_minecraft") {
		finalBorderWidth = Math.max(1, Math.round(borderWidth * 0.75));
		borderRadius = 1;
	} else if (skinFamily === "piece_crystal") {
		finalBorderWidth = Math.max(1, Math.round(borderWidth * 0.55));
		borderRadius = 5;
		shadow = `0 0 ${Math.max(4, Math.round(borderWidth * 1.2))}px ${colorToHex(skinColor)}`;
	} else if (skinFamily === "piece_lava") {
		finalBorderWidth = Math.max(1, Math.round(borderWidth * 0.9));
		borderRadius = 2;
		shadow = `0 0 ${Math.max(3, Math.round(borderWidth))}px rgba(255, 77, 0, 0.85)`;
	} else if (skinFamily === "piece_circuit") {
		finalBorderWidth = Math.max(1, Math.round(borderWidth * 0.45));
		borderRadius = 1;
		shadow = `inset 0 0 ${Math.max(2, Math.round(borderWidth))}px rgba(0, 255, 157, 0.55)`;
	} else if (hasExactPalette) {
		finalBorderWidth = Math.max(1, Math.round(borderWidth * 0.65));
		borderRadius = pieceSkinId === "piece_aurora_glass" ? 4 : 2;
		if (pieceSkinId === "piece_shadow_gold" || pieceSkinId === "piece_cosmic_ore") {
			shadow = `0 0 ${Math.max(3, Math.round(borderWidth))}px ${colorToHex(skinColor)}`;
		}
	}

	return {
		backgroundColor: colorToHex(skinColor), //'rgb(131, 83, 203)'
		...getBorderColors(skinColor),
		borderWidth: finalBorderWidth,
		borderRadius,
		boxSizing: 'border-box',
		boxShadow: shadow,
	}
}

export function createEmptyBlockStyle(borderColor: string = 'rgb(40, 40, 40)'): object {
	"worklet";
	return {
		backgroundColor: 'rgba(0, 0, 0, 0)',
		borderColor: borderColor,
		borderLeftColor: borderColor,
		borderTopColor: borderColor,
		borderRightColor: borderColor,
		borderBottomColor: borderColor,
		opacity: 1,
		borderWidth: 0.5,
		borderRadius: 0,
		boxSizing: 'border-box',
		boxShadow: 'none',
	}
}
