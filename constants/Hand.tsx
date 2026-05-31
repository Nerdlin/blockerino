import { PieceData, piecesData, pieceColors } from "./Piece";

export type Hand = (PieceData | null)[]

export function makeSeededPrng(seed: number) {
	"worklet";
	let s = seed;
	return {
		next: () => {
			s = (s * 1664525 + 1013904223) % 4294967296;
			return s / 4294967296;
		},
		nextInt: (min: number, max: number) => {
			s = (s * 1664525 + 1013904223) % 4294967296;
			const rand = s / 4294967296;
			return Math.floor(rand * (max - min + 1)) + min;
		}
	};
}

export function getNumericSeedFromDate(dateStr: string): number {
	"worklet";
	let hash = 0;
	for (let i = 0; i < dateStr.length; i++) {
		const char = dateStr.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return Math.abs(hash);
}

export function createSeededHand(size: number, seedNum: number): Hand {
	"worklet";
	const prng = makeSeededPrng(seedNum);
	const hand = new Array<PieceData | null>(size);
	for (let i = 0; i < size; i++) {
		const pieceIdx = prng.nextInt(0, piecesData.length - 1);
		const colorIdx = prng.nextInt(0, pieceColors.length - 1);
		const basePiece = piecesData[pieceIdx];
		hand[i] = {
			matrix: basePiece.matrix.map(row => [...row]),
			color: pieceColors[colorIdx],
			distributionPoints: basePiece.distributionPoints
		};
	}
	return hand;
}

export function createRandomHand(size: number, gameMode?: string): Hand {
	const hand = new Array<PieceData | null>(size);
	for (let i = 0; i < size; i++) {
		const { getRandomPiece } = require("./Piece");
		hand[i] = getRandomPiece(gameMode);
	}
	return hand;
}

export function createRandomHandWorklet(size: number, gameMode?: string): Hand {
	"worklet";
	const hand = new Array<PieceData | null>(size);
	for (let i = 0; i < size; i++) {
		const { getRandomPieceWorklet } = require("./Piece");
		hand[i] = getRandomPieceWorklet(gameMode);
	}
	return hand;
}