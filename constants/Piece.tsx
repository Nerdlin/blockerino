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

function getPieceSkinColor(color: Color, pieceSkinId: string = "piece_classic"): Color {
	"worklet";
	if (pieceSkinId === "piece_classic") {
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

	const palette = palettes[pieceSkinId];
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
	const skinColor = getPieceSkinColor(color, pieceSkinId);
	let finalBorderWidth = borderWidth;
	let borderRadius = 0;
	let shadow = "none";

	if (pieceSkinId === "piece_minecraft") {
		finalBorderWidth = Math.max(1, Math.round(borderWidth * 0.75));
		borderRadius = 1;
	} else if (pieceSkinId === "piece_crystal") {
		finalBorderWidth = Math.max(1, Math.round(borderWidth * 0.55));
		borderRadius = 5;
		shadow = `0 0 ${Math.max(4, Math.round(borderWidth * 1.2))}px ${colorToHex(skinColor)}`;
	} else if (pieceSkinId === "piece_lava") {
		finalBorderWidth = Math.max(1, Math.round(borderWidth * 0.9));
		borderRadius = 2;
		shadow = `0 0 ${Math.max(3, Math.round(borderWidth))}px rgba(255, 77, 0, 0.85)`;
	} else if (pieceSkinId === "piece_circuit") {
		finalBorderWidth = Math.max(1, Math.round(borderWidth * 0.45));
		borderRadius = 1;
		shadow = `inset 0 0 ${Math.max(2, Math.round(borderWidth))}px rgba(0, 255, 157, 0.55)`;
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
