jest.mock("@react-native-async-storage/async-storage", () => ({
	__esModule: true,
	default: {
		getItem: jest.fn(() => Promise.resolve(null)),
		setItem: jest.fn(() => Promise.resolve()),
		removeItem: jest.fn(() => Promise.resolve()),
	},
}));

jest.mock("@/constants/Supabase", () => ({
	supabase: {
		channel: jest.fn(),
		removeChannel: jest.fn(),
	},
	getMoreGameLeaderboard: jest.fn(() => Promise.resolve([])),
	getPlayerMoreGameRating: jest.fn(() => Promise.resolve(null)),
	submitMoreGameMatchResult: jest.fn(() => Promise.resolve([])),
	submitMoreGameSoloResult: jest.fn(() => Promise.resolve(null)),
}));

jest.mock("./StylizedButton", () => () => null);
jest.mock("./SimplePopupView", () => ({ children }: any) => children);

// eslint-disable-next-line import/first -- jest.mock calls are hoisted and must precede the import
import {
	canBeatDurakCard,
	getDurakNetPrize,
	getDurakPayout,
	getShipCells,
	getTicTacToeWinner,
	isShipPlacementValid,
	resolveDurakCardTarget,
	generateSudoku,
	countSudokuSolutions,
	createMahjongTiles,
	isMahjongTileFree,
	shuffleMahjongTiles,
	restoreChessGame,
	useMiniGameRoom,
	createDurakState,
	drawDurakCards,
} from "./MoreGamesMenu";

import { Chess } from "chess.js";
import React from "react";
import { act, create, ReactTestRenderer } from "react-test-renderer";
import { supabase } from "@/constants/Supabase";

describe("mini-game room delivery", () => {
	let room: ReturnType<typeof useMiniGameRoom>;
	let tree: ReactTestRenderer;
	const channels: any[] = [];
	const onEvent = jest.fn();
	function Harness({ game = 'tictactoe' }: { game?: 'tictactoe' | 'durak' }) { room = useMiniGameRoom(game, onEvent); return null; }
	beforeEach(async () => {
		onEvent.mockClear();
		channels.length = 0;
		(supabase.channel as jest.Mock).mockImplementation(() => {
			const channel: any = { send: jest.fn(() => Promise.resolve("ok")), on: jest.fn() };
			channel.on.mockReturnValue(channel);
			channel.subscribe = (callback: (status: string) => void) => { callback("SUBSCRIBED"); return channel; };
			channels.push(channel);
			return channel;
		});
		await act(async () => { tree = create(React.createElement(Harness)); });
		await act(async () => { room.connect("player1"); });
	});
	afterEach(async () => { await act(async () => { tree.unmount(); }); });
	it('does not announce a departure before a Durak seat was granted', async () => {
		await act(async () => { tree.update(React.createElement(Harness, { game: 'durak' })); });
		await act(async () => { room.connect('player2', 'TEST3'); });
		const channel = channels[channels.length - 1];
		await act(async () => { room.disconnect(); });
		expect(channel.send.mock.calls.map(([message]: any[]) => message.payload.event)).not.toContain('system_left');
	});
	it('does not let a new client replace a player after the deal', async () => {
		await act(async () => { tree.update(React.createElement(Harness, { game: 'durak' })); });
		await act(async () => { room.connect('player1', undefined, 3); });
		const channel = channels[channels.length - 1];
		const receive = channel.on.mock.calls[0][2];
		await act(async () => { room.send('sync', { state: { tableId: 'table' } }); });
		await act(async () => { receive({ payload: { event: 'seat_request', senderId: 'late', payload: {} } }); });
		expect(channel.send.mock.calls.at(-1)[0].payload.payload.seat).toBeNull();
	});
	it('allocates distinct Durak seats and rejects players beyond capacity', async () => {
		await act(async () => { tree.update(React.createElement(Harness, { game: 'durak' })); });
		await act(async () => { room.connect('player1', undefined, 3); });
		const channel = channels[channels.length - 1];
		const receive = channel.on.mock.calls[0][2];
		await act(async () => {
			for (const senderId of ['second', 'third', 'fourth', 'second']) receive({ payload: { event: 'seat_request', senderId, payload: {} } });
		});
		const grants = channel.send.mock.calls.map(([message]: any[]) => message.payload).filter((p: any) => p.event === 'seat_assigned');
		expect(grants.map((p: any) => p.payload.seat)).toEqual(['player2', 'player3', null, 'player2']);
	});
	it('only frees a reserved Durak seat for its own client, and reuses it before the deal', async () => {
		await act(async () => { tree.update(React.createElement(Harness, { game: 'durak' })); });
		await act(async () => { room.connect('player1', undefined, 3); });
		const channel = channels[channels.length - 1];
		const receive = channel.on.mock.calls[0][2];
		await act(async () => {
			receive({ payload: { event: 'seat_request', senderId: 'second', payload: {} } });
			receive({ payload: { event: 'system_left', senderId: 'outsider', role: 'player2', payload: {} } });
		});
		expect(onEvent).not.toHaveBeenCalled();
		await act(async () => {
			receive({ payload: { event: 'system_left', senderId: 'second', role: 'player2', payload: {} } });
			receive({ payload: { event: 'seat_request', senderId: 'replacement', payload: {} } });
		});
		expect(onEvent).toHaveBeenCalledWith('system_left', {}, 'player2');
		expect(channel.send.mock.calls.at(-1)[0].payload.payload.seat).toBe('player2');
	});
	it("reports a failed move delivery instead of staying connected", async () => {
		channels[0].send.mockResolvedValueOnce("timed out");
		await act(async () => { room.send("move", {}); });
		expect(room.status).toBe("error");
	});
	it("handles rejected sends without an unhandled rejection", async () => {
		channels[0].send.mockRejectedValueOnce(new Error("offline"));
		await act(async () => { room.send("move", {}); });
		expect(room.status).toBe("error");
	});
	it("ignores delivery failures belonging to the previous room", async () => {
		let fail!: (reason: Error) => void;
		channels[0].send.mockReturnValueOnce(new Promise((_, reject) => { fail = reject; }));
		await act(async () => { room.send("move", {}); });
		await act(async () => { room.connect("player1"); });
		await act(async () => { fail(new Error("old room disconnected")); });
		expect(room.status).toBe("connected");
	});
});

describe("puzzle and chess regressions", () => {
	it('continues a three-player Durak table until only one player has cards', () => {
		const state = createDurakState(3, ['throw_in']);
		state.deck = [];
		state.hands.player1 = [];
		state.hands.player2 = ['6S'];
		state.hands.player3 = ['7S'];
		const continued = drawDurakCards(state, 'player1');
		expect(continued.winner).toBeNull();
		expect(continued.attacker).toBe('player2');
		expect(continued.defender).toBe('player3');
		continued.hands.player2 = [];
		expect(drawDurakCards(continued, 'player2').winner).toBe('player1');
	});
	it("generates uniquely solvable Sudoku puzzles without changing givens", () => {
		for (let attempt = 0; attempt < 3; attempt++) {
			const { puzzle, solution } = generateSudoku();
			expect(countSudokuSolutions(puzzle.map((row) => [...row]), 2)).toBe(1);
			for (let i = 0; i < 9; i++) {
				expect(new Set(solution[i]).size).toBe(9);
				expect(new Set(solution.map((row) => row[i])).size).toBe(9);
				puzzle[i].forEach((value, x) => { if (value) expect(value).toBe(solution[i][x]); });
			}
		}
	});

	it("generates Mahjong layouts that can be fully cleared", () => {
		for (let attempt = 0; attempt < 30; attempt++) {
			const tiles = createMahjongTiles();
			while (tiles.some((tile) => !tile.removed)) {
				const free = tiles.filter((tile) => isMahjongTileFree(tile, tiles));
				const first = free.find((tile) => free.some((other) => other.id !== tile.id && other.matchKey === tile.matchKey));
				expect(first).toBeDefined();
				if (!first) break;
				const second = free.find((tile) => tile.id !== first.id && tile.matchKey === first.matchKey)!;
				first.removed = second.removed = true;
			}
		}
	});

	it("reshuffling always exposes a pair even with unlucky randomness", () => {
		const tiles = createMahjongTiles();
		const free = tiles.filter((tile) => isMahjongTileFree(tile, tiles));
		// Retain just two top tiles and their covered lower tiles, with crossed pairs.
		const top = free.filter((tile) => tile.z === 2 && tile.y === 2);
		const bottom = tiles.filter((tile) => tile.z === 0 && tile.y === 2 && top.some((upper) => upper.x === tile.x));
		const kept = [...top, ...bottom];
		expect(kept).toHaveLength(4);
		tiles.forEach((tile) => { tile.removed = !kept.includes(tile); });
		kept.forEach((tile, i) => { tile.symbol = tile.matchKey = i % 2 ? "B" : "A"; });
		const before = JSON.stringify(tiles);
		const random = jest.spyOn(Math, "random").mockReturnValue(0.999);
		try {
			const shuffled = shuffleMahjongTiles(tiles);
			const available = shuffled.filter((tile) => isMahjongTileFree(tile, shuffled));
			expect(available[0].matchKey).toBe(available[1].matchKey);
			expect(JSON.stringify(tiles)).toBe(before);
			expect(shuffled.filter((tile) => !tile.removed).map((tile) => tile.symbol).sort()).toEqual(["A", "A", "B", "B"]);
		} finally { random.mockRestore(); }
	});

	it("preserves threefold repetition when restoring chess state", () => {
		const moves = ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"];
		const chess = new Chess();
		moves.forEach((move) => chess.move(move));
		expect(restoreChessGame(chess.fen(), moves).isThreefoldRepetition()).toBe(true);
		expect(restoreChessGame(chess.fen(), []).fen()).toBe(chess.fen());
	});
});

describe("More Games rules", () => {
	it("detects tic-tac-toe wins", () => {
		expect(getTicTacToeWinner(["X", "X", "X", null, "O", null, "O", null, null])).toBe("X");
		expect(getTicTacToeWinner(["O", "X", null, "X", "O", null, "X", null, "O"])).toBe("O");
	});

	it("keeps Battleship ship lengths as occupied cells", () => {
		const destroyer = { id: "b2", name: "Destroyer", length: 2, x: 4, y: 3, orientation: "h" as const };

		expect(getShipCells(destroyer)).toEqual(["4,3", "5,3"]);
	});

	it("rejects overlapping Battleship placements", () => {
		const fleet = [
			{ id: "b2", name: "Destroyer", length: 2, x: 4, y: 3, orientation: "h" as const },
			{ id: "b3", name: "Cruiser", length: 3, x: 0, y: 0, orientation: "h" as const },
		];

		expect(isShipPlacementValid({ ...fleet[1], x: 5, y: 3 }, fleet)).toBe(false);
		expect(isShipPlacementValid({ ...fleet[1], x: 0, y: 5 }, fleet)).toBe(true);
	});

	it("rejects invalid coordinates and touching ships", () => {
		const ship = { id: "a", name: "A", length: 2, x: 0, y: 0, orientation: "h" as const };
		for (const x of [NaN, Infinity, -1, 0.5, 9]) expect(isShipPlacementValid({ ...ship, x }, [])).toBe(false);
		expect(isShipPlacementValid({ ...ship, length: 0 }, [])).toBe(false);
		expect(isShipPlacementValid({ ...ship, id: "b", x: 2, y: 1 }, [ship])).toBe(false);
	});

	it("uses Durak trump and suit rules for defense", () => {
		expect(canBeatDurakCard("9H", "7H", "S")).toBe(true);
		expect(canBeatDurakCard("7H", "9H", "S")).toBe(false);
		expect(canBeatDurakCard("6S", "AH", "S")).toBe(true);
		expect(canBeatDurakCard("AH", "6S", "S")).toBe(false);
	});

	it("prefers an explicit defense target over accidental transfer", () => {
		const table = [
			{ attack: "7H", defense: null },
			{ attack: "6D", defense: null },
		];

		expect(resolveDurakCardTarget(table, "7D", "S", ["transfer"], null)).toEqual({ index: 1, action: "defend" });
		expect(resolveDurakCardTarget(table, "7D", "S", ["transfer"], 0)).toEqual({ index: 0, action: "transfer" });
	});

	it("settles the Durak pot so the winner nets (players - 1) * bet", () => {
		// Everyone antes their bet; the winner is credited the gross pot to offset
		// their own ante, leaving a net gain of (players - 1) * bet.
		expect(getDurakPayout(100, 2)).toBe(200);
		expect(getDurakNetPrize(100, 2)).toBe(100);
		expect(getDurakPayout(100, 6)).toBe(600);
		expect(getDurakNetPrize(100, 6)).toBe(500);
		// A zero bet keeps everything at zero (no coins move).
		expect(getDurakNetPrize(0, 6)).toBe(0);
	});
});
