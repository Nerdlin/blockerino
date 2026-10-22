import { BLUNDER_RATE, BotDifficulty, pickRandom, Rng } from "./Difficulty";

// The computer's gunner for Sea Battle. It only uses what a human could see: its own earlier shots and which ships
// are already sunk. Cells are "x,y" strings on a 10x10 board. Ships never touch (not even diagonally), so the ring
// around a sunk ship is known to be empty.

export const BOT_BOARD_SIZE = 10;
export const FLEET_LENGTHS = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];

type ShotMap = Record<string, string>;

const parse = (cell: string): [number, number] => {
	const [x, y] = cell.split(",").map(Number);
	return [x, y];
};
const key = (x: number, y: number) => `${x},${y}`;
const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < BOT_BOARD_SIZE && y < BOT_BOARD_SIZE;

function ringOf(cells: string[]): Set<string> {
	const ring = new Set<string>();
	for (const cell of cells) {
		const [x, y] = parse(cell);
		for (let dx = -1; dx <= 1; dx++) {
			for (let dy = -1; dy <= 1; dy++) {
				if (inside(x + dx, y + dy)) ring.add(key(x + dx, y + dy));
			}
		}
	}
	return ring;
}

/** Ship lengths that are still afloat once the given ships (as lists of cells) are sunk. */
export function remainingShipLengths(sunk: string[][]): number[] {
	const remaining = [...FLEET_LENGTHS];
	for (const ship of sunk) {
		const at = remaining.indexOf(ship.length);
		if (at >= 0) remaining.splice(at, 1);
	}
	return remaining;
}

function openCells(shots: ShotMap, blocked: Set<string>): string[] {
	const cells: string[] = [];
	for (let y = 0; y < BOT_BOARD_SIZE; y++) {
		for (let x = 0; x < BOT_BOARD_SIZE; x++) {
			const cell = key(x, y);
			if (!shots[cell] && !blocked.has(cell)) cells.push(cell);
		}
	}
	return cells;
}

/** Hits that belong to a ship that is not sunk yet. */
function liveHits(shots: ShotMap, sunk: string[][]): string[] {
	const sunkCells = new Set(sunk.flat());
	return Object.keys(shots).filter((cell) => shots[cell] === "hit" && !sunkCells.has(cell));
}

function neighbours(cell: string): string[] {
	const [x, y] = parse(cell);
	return [[1, 0], [-1, 0], [0, 1], [0, -1]]
		.map(([dx, dy]) => [x + dx, y + dy])
		.filter(([nx, ny]) => inside(nx, ny))
		.map(([nx, ny]) => key(nx, ny));
}

/** After a hit: prefer cells that extend a line of two or more hits, otherwise any cell next to a hit. */
function followUpCells(hits: string[], open: Set<string>): string[] {
	const hitSet = new Set(hits);
	const inLine: string[] = [];
	for (const hit of hits) {
		const [x, y] = parse(hit);
		for (const [dx, dy] of [[1, 0], [0, 1]]) {
			if (hitSet.has(key(x + dx, y + dy)) || hitSet.has(key(x - dx, y - dy))) {
				// walk along the line of hits and take the cells just beyond it
				let fx = x;
				let fy = y;
				while (hitSet.has(key(fx + dx, fy + dy))) { fx += dx; fy += dy; }
				let bx = x;
				let by = y;
				while (hitSet.has(key(bx - dx, by - dy))) { bx -= dx; by -= dy; }
				for (const cell of [key(fx + dx, fy + dy), key(bx - dx, by - dy)]) if (open.has(cell)) inLine.push(cell);
			}
		}
	}
	if (inLine.length > 0) return inLine;
	return hits.flatMap(neighbours).filter((cell) => open.has(cell));
}

/**
 * How many ways each open cell could still hold part of a remaining ship. Placements have to avoid known misses and
 * the rings around sunk ships; once a ship is wounded only placements that cover a wounded cell count.
 */
function densityMap(shots: ShotMap, blocked: Set<string>, lengths: number[], hits: string[]): Map<string, number> {
	const density = new Map<string, number>();
	const hitSet = new Set(hits);
	const unavailable = (cell: string) => shots[cell] === "miss" || blocked.has(cell) || (shots[cell] === "hit" && !hitSet.has(cell));

	for (const length of new Set(lengths)) {
		const copies = lengths.filter((value) => value === length).length;
		for (const [dx, dy] of length === 1 ? [[1, 0]] : [[1, 0], [0, 1]]) {
			for (let y = 0; y < BOT_BOARD_SIZE; y++) {
				for (let x = 0; x < BOT_BOARD_SIZE; x++) {
					const cells: string[] = [];
					let fits = true;
					for (let i = 0; i < length; i++) {
						const nx = x + dx * i;
						const ny = y + dy * i;
						if (!inside(nx, ny) || unavailable(key(nx, ny))) { fits = false; break; }
						cells.push(key(nx, ny));
					}
					if (!fits) continue;
					const covered = cells.filter((cell) => hitSet.has(cell)).length;
					if (hits.length > 0 && covered === 0) continue;
					const weight = copies * (covered > 0 ? 40 * covered : 1);
					for (const cell of cells) {
						if (!shots[cell]) density.set(cell, (density.get(cell) ?? 0) + weight);
					}
				}
			}
		}
	}
	return density;
}

/**
 * Picks the next cell to shoot.
 *  - easy: random cells, only now and then finishes a wounded ship
 *  - medium: random hunting, then follows up hits in a line until the ship sinks
 *  - hard: hunts where the most ships could still fit and finishes wounded ships efficiently
 * `shots` are the bot's earlier shots ("hit"/"miss"), `sunk` the ships it has sunk (lists of cells).
 */
export function chooseBattleshipShot(shots: ShotMap, sunk: string[][], difficulty: BotDifficulty, rng: Rng = Math.random): string {
	const blocked = ringOf(sunk.flat());
	const open = openCells(shots, blocked);
	if (open.length === 0) return key(0, 0);
	const openSet = new Set(open);
	const hits = liveHits(shots, sunk);

	if (hits.length > 0 && rng() >= BLUNDER_RATE[difficulty]) {
		if (difficulty === "hard") {
			const density = densityMap(shots, blocked, remainingShipLengths(sunk), hits);
			const best = bestOf(density, openSet, rng);
			if (best) return best;
		}
		const follow = followUpCells(hits, openSet);
		if (follow.length > 0) return pickRandom(rng, follow);
	}

	if (difficulty === "hard") {
		const density = densityMap(shots, blocked, remainingShipLengths(sunk), []);
		const best = bestOf(density, openSet, rng);
		if (best) return best;
	}
	return pickRandom(rng, open);
}

function bestOf(density: Map<string, number>, open: Set<string>, rng: Rng): string | null {
	let top = 0;
	let cells: string[] = [];
	for (const [cell, value] of density) {
		if (!open.has(cell)) continue;
		if (value > top) {
			top = value;
			cells = [cell];
		} else if (value === top) {
			cells.push(cell);
		}
	}
	return cells.length > 0 ? pickRandom(rng, cells) : null;
}
