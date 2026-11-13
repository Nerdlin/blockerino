import { PieceData, getRandomPiece, getRandomPieceWorklet, isClassicComplexPiece, piecesData, pieceColors } from "./Piece";

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

export function createRandomHand(size: number, gameMode?: string, difficulty: number = 0): Hand {
	const hand = new Array<PieceData | null>(size);
	// A hand normally holds one guaranteed small "rescue" piece; the harder the run, the more hands come without it.
	const rescueIndex = Math.random() < 1 - 0.75 * difficulty ? Math.floor(Math.random() * size) : -1;
	if (gameMode !== 'chaos') {
		// Classic keeps big pieces out while the run is young, then lets one into a hand more and more often.
		const complexSlot = Math.random() < 0.7 * difficulty ? Math.floor(Math.random() * size) : -1;

		for (let i = 0; i < size; i++) {
			const rescueOnly = i === rescueIndex;
			const excludeComplex = i !== complexSlot;
			hand[i] = getRandomPiece(gameMode, rescueOnly, excludeComplex, difficulty);
		}
		return hand;
	}

	const complexLimit = Math.max(1, Math.floor(size / 2)) + (difficulty >= 0.5 ? 1 : 0);
	let complexCount = 0;
	for (let i = 0; i < size; i++) {
		const rescueOnly = i === rescueIndex;
		const excludeComplex = !rescueOnly && complexCount >= complexLimit;
		const piece = getRandomPiece(gameMode, rescueOnly, excludeComplex, difficulty);
		if (isClassicComplexPiece(piece)) {
			complexCount++;
		}
		hand[i] = piece;
	}
	return hand;
}

export function createRandomHandWorklet(size: number, gameMode?: string, difficulty: number = 0): Hand {
	"worklet";
	const hand = new Array<PieceData | null>(size);
	// A hand normally holds one guaranteed small "rescue" piece; the harder the run, the more hands come without it.
	const rescueIndex = Math.random() < 1 - 0.75 * difficulty ? Math.floor(Math.random() * size) : -1;
	if (gameMode !== 'chaos') {
		// Classic keeps big pieces out while the run is young, then lets one into a hand more and more often.
		const complexSlot = Math.random() < 0.7 * difficulty ? Math.floor(Math.random() * size) : -1;

		for (let i = 0; i < size; i++) {
			const rescueOnly = i === rescueIndex;
			const excludeComplex = i !== complexSlot;
			hand[i] = getRandomPieceWorklet(gameMode, rescueOnly, excludeComplex, difficulty);
		}
		return hand;
	}

	const complexLimit = Math.max(1, Math.floor(size / 2)) + (difficulty >= 0.5 ? 1 : 0);
	let complexCount = 0;
	for (let i = 0; i < size; i++) {
		const rescueOnly = i === rescueIndex;
		const excludeComplex = !rescueOnly && complexCount >= complexLimit;
		const piece = getRandomPieceWorklet(gameMode, rescueOnly, excludeComplex, difficulty);
		if (isClassicComplexPiece(piece)) {
			complexCount++;
		}
		hand[i] = piece;
	}
	return hand;
}
