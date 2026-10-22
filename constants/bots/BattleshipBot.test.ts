import { chooseBattleshipShot, FLEET_LENGTHS, remainingShipLengths } from "./BattleshipBot";
import type { BotDifficulty } from "./Difficulty";

const seeded = (seed: number) => () => {
	seed = (seed * 1664525 + 1013904223) % 4294967296;
	return seed / 4294967296;
};

type Ship = string[];

// A compact random fleet generator for the tests (ships may not touch, even diagonally).
function randomFleet(rng: () => number): Ship[] {
	for (let round = 0; round < 200; round++) {
		const ships: Ship[] = [];
		const taken = new Set<string>();
		let ok = true;
		for (const length of FLEET_LENGTHS) {
			let placed = false;
			for (let attempt = 0; attempt < 200 && !placed; attempt++) {
				const horizontal = rng() < 0.5;
				const x = Math.floor(rng() * 10);
				const y = Math.floor(rng() * 10);
				const cells = Array.from({ length }, (_, i) => `${x + (horizontal ? i : 0)},${y + (horizontal ? 0 : i)}`);
				if (cells.some((cell) => cell.split(",").some((n) => Number(n) > 9))) continue;
				const near = cells.some((cell) => {
					const [cx, cy] = cell.split(",").map(Number);
					for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (taken.has(`${cx + dx},${cy + dy}`)) return true;
					return false;
				});
				if (near) continue;
				cells.forEach((cell) => taken.add(cell));
				ships.push(cells);
				placed = true;
			}
			if (!placed) { ok = false; break; }
		}
		if (ok) return ships;
	}
	throw new Error("no fleet");
}

function shotsToSinkFleet(difficulty: BotDifficulty, seed: number): number {
	const rng = seeded(seed);
	const fleet = randomFleet(rng);
	const occupied = new Set(fleet.flat());
	const shots: Record<string, string> = {};
	const sunk: string[][] = [];
	let count = 0;
	while (sunk.length < fleet.length) {
		const cell = chooseBattleshipShot(shots, sunk, difficulty, rng);
		expect(shots[cell]).toBeUndefined();
		count++;
		if (count > 100) throw new Error("too many shots");
		shots[cell] = occupied.has(cell) ? "hit" : "miss";
		if (shots[cell] === "hit") {
			const ship = fleet.find((cells) => cells.includes(cell))!;
			if (ship.every((c) => shots[c] === "hit") && !sunk.includes(ship)) sunk.push(ship);
		}
	}
	return count;
}

const average = (difficulty: BotDifficulty, games = 40) => {
	let total = 0;
	for (let i = 0; i < games; i++) total += shotsToSinkFleet(difficulty, i * 7 + 3);
	return total / games;
};

describe("remainingShipLengths", () => {
	it("removes sunk ships from the fleet", () => {
		expect(remainingShipLengths([])).toEqual([4, 3, 3, 2, 2, 2, 1, 1, 1, 1]);
		expect(remainingShipLengths([["0,0", "1,0", "2,0", "3,0"], ["9,9"]])).toEqual([3, 3, 2, 2, 2, 1, 1, 1]);
	});
});

describe("chooseBattleshipShot", () => {
	it("always sinks the whole fleet without repeating a cell, at every level", () => {
		for (const difficulty of ["easy", "medium", "hard"] as const) {
			for (let i = 0; i < 10; i++) shotsToSinkFleet(difficulty, i + 1);
		}
	});

	it("never shoots the ring around a sunk ship", () => {
		const sunk = [["4,4", "5,4"]];
		const shots: Record<string, string> = { "4,4": "hit", "5,4": "hit" };
		for (let i = 0; i < 100; i++) {
			const cell = chooseBattleshipShot(shots, sunk, "medium", seeded(i + 1));
			const [x, y] = cell.split(",").map(Number);
			expect(x >= 3 && x <= 6 && y >= 3 && y <= 5).toBe(false);
		}
	});

	it("follows up a hit next to it on medium and hard", () => {
		const shots: Record<string, string> = { "5,5": "hit" };
		for (const difficulty of ["medium", "hard"] as const) {
			let adjacent = 0;
			for (let i = 0; i < 40; i++) {
				const [x, y] = chooseBattleshipShot(shots, [], difficulty, seeded(i + 11)).split(",").map(Number);
				if (Math.abs(x - 5) + Math.abs(y - 5) === 1) adjacent++;
			}
			expect(adjacent).toBeGreaterThan(difficulty === "hard" ? 39 : 28);
		}
	});

	it("gets better with the level: hard < medium < easy shots to win", () => {
		const easy = average("easy");
		const medium = average("medium");
		const hard = average("hard");
		expect(hard).toBeLessThan(medium);
		expect(medium).toBeLessThan(easy);
		expect(hard).toBeLessThan(65);
	});
});
