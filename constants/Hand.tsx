import { PieceData, isClassicComplexPiece, piecesData, pieceColors } from "./Piece";

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

export function getDailyPuzzleKey(date: Date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function chooseSeededPiece(prng: ReturnType<typeof makeSeededPrng>, excludeComplex: boolean = true): typeof piecesData[number] {
	"worklet";
	let total = 0;
	for (let i = 0; i < piecesData.length; i++) {
		const piece = piecesData[i];
		if (excludeComplex && isClassicComplexPiece(piece)) {
			continue;
		}
		total += piece.distributionPoints;
	}

	let position = prng.next() * total;
	for (let i = 0; i < piecesData.length; i++) {
		const piece = piecesData[i];
		if (excludeComplex && isClassicComplexPiece(piece)) {
			continue;
		}
		position -= piece.distributionPoints;
		if (position < 0) {
			return piece;
		}
	}

	return piecesData[0];
}

export function createSeededHand(size: number, seedNum: number): Hand {
	"worklet";
	const prng = makeSeededPrng(seedNum);
	const hand = new Array<PieceData | null>(size);
	for (let i = 0; i < size; i++) {
		const colorIdx = prng.nextInt(0, pieceColors.length - 1);
		const basePiece = chooseSeededPiece(prng, true);
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
	if (gameMode !== 'chaos') {
		const { getRandomPiece } = require("./Piece");
		const rescueIndex = Math.floor(Math.random() * size);

		for (let i = 0; i < size; i++) {
			const rescueOnly = i === rescueIndex;
			const excludeComplex = true;
			hand[i] = getRandomPiece(gameMode, rescueOnly, excludeComplex);
		}
		return hand;
	}

	const { getRandomPiece } = require("./Piece");
	const rescueIndex = Math.floor(Math.random() * size);
	const complexLimit = Math.max(1, Math.floor(size / 2));
	let complexCount = 0;
	for (let i = 0; i < size; i++) {
		const rescueOnly = i === rescueIndex;
		const excludeComplex = !rescueOnly && complexCount >= complexLimit;
		const piece = getRandomPiece(gameMode, rescueOnly, excludeComplex);
		if (isClassicComplexPiece(piece)) {
			complexCount++;
		}
		hand[i] = piece;
	}
	return hand;
}

export function createRandomHandWorklet(size: number, gameMode?: string): Hand {
	"worklet";
	const hand = new Array<PieceData | null>(size);
	if (gameMode !== 'chaos') {
		const { getRandomPieceWorklet } = require("./Piece");
		const rescueIndex = Math.floor(Math.random() * size);

		for (let i = 0; i < size; i++) {
			const rescueOnly = i === rescueIndex;
			const excludeComplex = true;
			hand[i] = getRandomPieceWorklet(gameMode, rescueOnly, excludeComplex);
		}
		return hand;
	}

	const { getRandomPieceWorklet } = require("./Piece");
	const rescueIndex = Math.floor(Math.random() * size);
	const complexLimit = Math.max(1, Math.floor(size / 2));
	let complexCount = 0;
	for (let i = 0; i < size; i++) {
		const rescueOnly = i === rescueIndex;
		const excludeComplex = !rescueOnly && complexCount >= complexLimit;
		const piece = getRandomPieceWorklet(gameMode, rescueOnly, excludeComplex);
		if (isClassicComplexPiece(piece)) {
			complexCount++;
		}
		hand[i] = piece;
	}
	return hand;
}
