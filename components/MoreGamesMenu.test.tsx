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
	betFromPosition,
	createRandomFleet,
	positionFromBet,
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
	getRepeatedShotReply,
	CHESS_BOARD_COLORS,
	CHESS_PIECE_COLORS,
	MAHJONG_THEMES,
	CARD_SKINS,
	SEA_SKINS,
	SUDOKU_THEMES,
	pickCosmetic,
} from "./MoreGamesMenu";

import { Chess } from "chess.js";
import React from "react";
import { act, create, ReactTestRenderer } from "react-test-renderer";
import { supabase } from "@/constants/Supabase";
import { SHOP_ITEMS, type ShopCategory } from "@/constants/Shop";

describe("mini-game room delivery", () => {
	let room: ReturnType<typeof useMiniGameRoom>;
	let tree: ReactTestRenderer;
	const channels: any[] = [];
	const onEvent = jest.fn();
	function Harness({ game = 'tictactoe' }: { game?: 'tictactoe' | 'durak' | 'battleship' }) { room = useMiniGameRoom(game, onEvent); return null; }
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
	it('seats exactly one guest in a Sea Battle room and ignores everyone else', async () => {
		await act(async () => { tree.update(React.createElement(Harness, { game: 'battleship' })); });
		await act(async () => { room.connect('player1'); });
		const channel = channels[channels.length - 1];
		const receive = channel.on.mock.calls[0][2];
		await act(async () => {
			for (const senderId of ['guest', 'third']) receive({ payload: { event: 'seat_request', senderId, payload: {} } });
			receive({ payload: { event: 'shot', senderId: 'third', role: 'player2', payload: { cell: '1,1' } } });
		});
		const grants = channel.send.mock.calls.map(([message]: any[]) => message.payload).filter((p: any) => p.event === 'seat_assigned');
		expect(grants.map((p: any) => p.payload.seat)).toEqual(['player2', null]);
		expect(onEvent).not.toHaveBeenCalled();
		await act(async () => { receive({ payload: { event: 'shot', senderId: 'guest', role: 'player2', payload: { cell: '2,2' } } }); });
		expect(onEvent).toHaveBeenCalledWith('shot', { cell: '2,2' }, 'player2');
	});
	it('answers a re-sent Sea Battle shot with the same result and flags a lost fleet', () => {
		const occupied = new Set(['0,0', '0,1']);
		expect(getRepeatedShotReply({}, occupied, '0,0')).toBeNull();
		expect(getRepeatedShotReply({ '0,0': 'hit' }, occupied, '0,0')).toEqual({ result: 'hit', lost: false });
		expect(getRepeatedShotReply({ '0,0': 'hit', '0,1': 'hit' }, occupied, '0,1')).toEqual({ result: 'hit', lost: true });
		expect(getRepeatedShotReply({ '5,5': 'miss' }, occupied, '5,5')).toEqual({ result: 'miss', lost: false });
	});
	it('reports a peer that vanished without system_left once the grace period passes', async () => {
		jest.useFakeTimers();
		try {
			const channel = channels[channels.length - 1];
			const leave = channel.on.mock.calls.find((call: any[]) => call[0] === 'presence')[2];
			await act(async () => { leave({ key: 'peer', leftPresences: [{ role: 'player2' }] }); });
			expect(onEvent).not.toHaveBeenCalled();
			await act(async () => { jest.advanceTimersByTime(10001); });
			expect(onEvent).toHaveBeenCalledWith('system_left', {}, 'player2');
		} finally {
			jest.useRealTimers();
		}
	});
	it('ignores a presence drop when the peer already said goodbye or came back', async () => {
		jest.useFakeTimers();
		try {
			const channel = channels[channels.length - 1];
			const receive = channel.on.mock.calls[0][2];
			const leave = channel.on.mock.calls.find((call: any[]) => call[0] === 'presence')[2];
			await act(async () => { receive({ payload: { event: 'system_left', senderId: 'peer', role: 'player2', payload: {} } }); });
			onEvent.mockClear();
			await act(async () => { leave({ key: 'peer', leftPresences: [{ role: 'player2' }] }); });
			await act(async () => { jest.advanceTimersByTime(10001); });
			expect(onEvent).not.toHaveBeenCalled();
			channel.presenceState = () => ({ other: [{}] });
			await act(async () => { leave({ key: 'other', leftPresences: [{ role: 'player2' }] }); });
			await act(async () => { jest.advanceTimersByTime(10001); });
			expect(onEvent).not.toHaveBeenCalled();
		} finally {
			jest.useRealTimers();
		}
	});
	it('fails a join when nobody else is in the room', async () => {
		jest.useFakeTimers();
		try {
			(supabase.channel as jest.Mock).mockImplementationOnce(() => {
				const channel: any = { send: jest.fn(() => Promise.resolve('ok')), on: jest.fn(), track: jest.fn(() => Promise.resolve('ok')), presenceState: () => ({}) };
				channel.on.mockReturnValue(channel);
				channel.subscribe = (callback: (status: string) => void) => { callback('SUBSCRIBED'); return channel; };
				return channel;
			});
			await act(async () => { room.connect('player2', 'NOONE'); });
			expect(room.status).toBe('connected');
			await act(async () => { jest.advanceTimersByTime(12001); });
			expect(room.status).toBe('error');
		} finally {
			jest.useRealTimers();
		}
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
	it('declares a draw when every Durak seat runs out of cards on the same deal', () => {
		const state = createDurakState(2, ['throw_in']);
		state.deck = [];
		state.hands.player1 = [];
		state.hands.player2 = [];
		const result = drawDurakCards(state, 'player1');
		expect(result.draw).toBe(true);
		expect(result.winner).toBe('player1');
	});
	it('does not mark a normal Durak finish as a draw', () => {
		const state = createDurakState(2, ['throw_in']);
		state.deck = [];
		state.hands.player1 = [];
		state.hands.player2 = ['6S'];
		const result = drawDurakCards(state, 'player1');
		expect(result.winner).toBe('player1');
		expect(result.draw).toBeUndefined();
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

describe("durak bet slider", () => {
	it("never lets the bet exceed the balance", () => {
		for (const balance of [100, 230, 250, 5000, 1_250_000]) {
			for (let position = 0; position <= 1; position += 0.05) {
				const bet = betFromPosition(position, balance);
				expect(bet).toBeLessThanOrEqual(balance);
				expect(bet).toBeGreaterThanOrEqual(Math.min(100, balance));
			}
		}
	});

	it("spans the whole track from the minimum bet to the full balance", () => {
		expect(betFromPosition(0, 250)).toBe(100);
		expect(betFromPosition(1, 250)).toBe(250);
		expect(betFromPosition(1, 1_250_000)).toBe(1_250_000);
	});

	it("round-trips a bet back to its slider position", () => {
		for (const balance of [250, 20_000]) {
			for (const bet of [100, 150, 250]) {
				if (bet > balance) continue;
				const position = positionFromBet(bet, balance);
				expect(position).toBeGreaterThanOrEqual(0);
				expect(position).toBeLessThanOrEqual(1);
				expect(Math.abs(betFromPosition(position, balance) - bet)).toBeLessThanOrEqual(10);
			}
		}
	});

	it("gives a player below the minimum bet a fixed bet equal to their balance", () => {
		expect(betFromPosition(0.5, 40)).toBe(40);
		expect(positionFromBet(40, 40)).toBe(0);
	});
});

describe("sea battle random fleet", () => {
	it("keeps the default ship ids and produces a valid, fully placed fleet", () => {
		for (let i = 0; i < 30; i += 1) {
			const fleet = createRandomFleet();
			expect(fleet.map((ship) => ship.id)).toEqual(["b4", "b3a", "b3b", "b2a", "b2b", "b2c", "b1a", "b1b", "b1c", "b1d"]);
			expect(fleet.every((ship) => ship.x >= 0 && isShipPlacementValid(ship, fleet))).toBe(true);
		}
	});
});

describe("More Games shop cosmetics", () => {
	const palettes: Record<string, [ShopCategory, string, Record<string, unknown>]> = {
		chess_piece: ["chess_piece", "chess_piece_", CHESS_PIECE_COLORS],
		chess_board: ["chess_board", "chess_board_", CHESS_BOARD_COLORS],
		sea_skin: ["sea_skin", "sea_skin_", SEA_SKINS],
		card_skin: ["card_skin", "card_skin_", CARD_SKINS],
		sudoku_theme: ["sudoku_theme", "sudoku_theme_", SUDOKU_THEMES],
		mahjong_theme: ["mahjong_theme", "mahjong_theme_", MAHJONG_THEMES],
	};

	it("gives every shop item a palette, so nothing a player buys renders as the default", () => {
		for (const [category, prefix, palette] of Object.values(palettes)) {
			const ids = SHOP_ITEMS.filter((item) => item.category === category).map((item) => item.id);
			expect(ids.length).toBeGreaterThan(0);
			for (const id of ids) expect(Object.keys(palette)).toContain(id.slice(prefix.length));
		}
	});

	it("has no palette without a shop item to unlock it", () => {
		for (const [category, prefix, palette] of Object.values(palettes)) {
			const ids = SHOP_ITEMS.filter((item) => item.category === category).map((item) => item.id.slice(prefix.length));
			for (const key of Object.keys(palette)) expect(ids).toContain(key);
		}
	});

	it("keeps every free default item and gives paid items a price", () => {
		for (const [category] of Object.values(palettes)) {
			const items = SHOP_ITEMS.filter((item) => item.category === category);
			expect(items.filter((item) => item.price === 0)).toHaveLength(1);
			expect(items.every((item) => item.price >= 0)).toBe(true);
		}
	});

	it("falls back when an equipped item is missing or unknown", () => {
		expect(pickCosmetic(CHESS_BOARD_COLORS, "chess_board_candy", "chess_board_", "slate")).toBe("candy");
		expect(pickCosmetic(CHESS_BOARD_COLORS, undefined, "chess_board_", "slate")).toBe("slate");
		expect(pickCosmetic(CHESS_BOARD_COLORS, "chess_board_retired", "chess_board_", "slate")).toBe("slate");
		expect(pickCosmetic(CHESS_BOARD_COLORS, "chess_board_toString", "chess_board_", "slate")).toBe("slate");
	});

	it("keeps chess piece colours readable: white and black pieces differ", () => {
		for (const colors of Object.values(CHESS_PIECE_COLORS)) expect(colors.white).not.toBe(colors.black);
		for (const colors of Object.values(CHESS_BOARD_COLORS)) expect(colors.light).not.toBe(colors.dark);
	});
});
