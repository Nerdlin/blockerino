const mockChannels: any[] = [];
let mockStoredBotSettings: string | null = null;

jest.mock("@react-native-async-storage/async-storage", () => ({
	__esModule: true,
	default: {
		getItem: jest.fn(() => Promise.resolve(mockStoredBotSettings)),
		setItem: jest.fn(() => Promise.resolve()),
		removeItem: jest.fn(() => Promise.resolve()),
	},
}));

jest.mock("@/constants/Supabase", () => ({
	supabase: { channel: jest.fn(), removeChannel: jest.fn() },
	getMoreGameLeaderboard: jest.fn(() => Promise.resolve([])),
	getPlayerMoreGameRating: jest.fn(() => Promise.resolve(null)),
	submitMoreGameMatchResult: jest.fn(() => Promise.resolve([])),
}));

// a room whose channel records what the game sends and lets the test deliver what the opponent sends
jest.mock("@/constants/RoomSocket", () => ({
	loadRealtimeBackend: jest.fn(() => Promise.resolve()),
	realtime: {
		channel: jest.fn(() => {
			const channel: any = { handlers: {}, sent: [] };
			channel.on = jest.fn((type: string, filter: any, callback: any) => {
				channel.handlers[`${type}:${filter?.event ?? ""}`] = callback;
				return channel;
			});
			channel.subscribe = (callback: (status: string) => void) => {
				callback("SUBSCRIBED");
				return channel;
			};
			channel.send = jest.fn((message: any) => {
				channel.sent.push(message.payload);
				return Promise.resolve("ok");
			});
			channel.track = jest.fn(() => Promise.resolve("ok"));
			channel.presenceState = () => ({ self: [{}], guest: [{}] });
			mockChannels.push(channel);
			return channel;
		}),
		removeChannel: jest.fn(),
	},
}));

jest.mock("@/constants/Sound", () => ({ useSoundSettings: () => ({ playSfx: jest.fn() }) }));
jest.mock("expo-haptics", () => ({
	notificationAsync: jest.fn(() => Promise.resolve()),
	impactAsync: jest.fn(() => Promise.resolve()),
	NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
	ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));
jest.mock("./AdminWinButton", () => ({ AdminWinButton: () => null }));
jest.mock("./HintButton", () => ({ HintButton: () => null }));
jest.mock("../ShareRoomButton", () => () => null);
jest.mock("./InviteFriendsPanel", () => ({ InviteFriendsPanel: () => null }));
jest.mock("../PixelLoader", () => () => null);
jest.mock("@/constants/Achievements", () => ({ recordMoreGameWin: jest.fn() }));
jest.mock("@/constants/GameStats", () => ({ recordGameOutcome: jest.fn() }));

import { Dimensions } from "react-native";
import { act, create, ReactTestRenderer } from "react-test-renderer";
import { submitMoreGameMatchResult } from "@/constants/Supabase";
import { recordMoreGameWin } from "@/constants/Achievements";
import { BackgammonState, BgMove, initialPosition, isValidState } from "@/constants/backgammon/Rules";
import { DEFAULT_EXTRA_COSMETICS } from "./cosmetics";
import { BackgammonGame } from "./BackgammonGame";
import { boardMetrics, pointRect } from "./backgammon/layout";

// the board is sized from the window, the way the game does it
const m = boardMetrics(Math.min(480, Math.max(260, Dimensions.get("window").width - 28)));

let stamp = 1000;
const touchHistory = (x: number, y: number, fromX: number, fromY: number) => {
	stamp += 16;
	return {
		indexOfSingleActiveTouch: 0,
		mostRecentTimeStamp: stamp,
		numberActiveTouches: 1,
		touchBank: [{ touchActive: true, startPageX: fromX, startPageY: fromY, startTimeStamp: stamp - 16, currentPageX: x, currentPageY: y, currentTimeStamp: stamp, previousPageX: fromX, previousPageY: fromY, previousTimeStamp: stamp - 16 }],
	};
};

/** A touch on the board's surface from (x, y), optionally dragged to (x + dx, y + dy) before it lifts. */
function touch(renderer: ReactTestRenderer, x: number, y: number, dx = 0, dy = 0) {
	const surface = renderer.root.findByProps({ testID: "backgammon-touch" }).props;
	act(() => {
		surface.onResponderGrant({ nativeEvent: { locationX: x, locationY: y }, touchHistory: touchHistory(x, y, x, y) });
	});
	if (dx !== 0 || dy !== 0) {
		act(() => {
			surface.onResponderMove({ nativeEvent: { locationX: x, locationY: y }, touchHistory: touchHistory(x + dx, y + dy, x, y) });
		});
	}
	act(() => {
		surface.onResponderRelease({ nativeEvent: { locationX: x + dx, locationY: y + dy }, touchHistory: touchHistory(x + dx, y + dy, x, y) });
	});
}

/** The middle of a view point, where a finger would land. */
const at = (viewRel: number) => {
	const rect = pointRect(m, viewRel);
	return { x: rect.x + rect.w / 2, y: rect.top ? rect.h * 0.3 : rect.y + rect.h * 0.7 };
};
const tapPoint = (renderer: ReactTestRenderer, viewRel: number) => {
	const spot = at(viewRel);
	touch(renderer, spot.x, spot.y);
};
const dragPoint = (renderer: ReactTestRenderer, from: number, to: number) => {
	const start = at(from);
	const end = at(to);
	touch(renderer, start.x, start.y, end.x - start.x, end.y - start.y);
};

const texts = (renderer: ReactTestRenderer): string => {
	const out: string[] = [];
	const walk = (node: any) => {
		if (typeof node === "string") out.push(node);
		else if (node && node.children) node.children.forEach(walk);
	};
	walk(renderer.toJSON());
	return out.join("|");
};

const press = (renderer: ReactTestRenderer, label: string) => {
	const button = renderer.root.findAll((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === "function")[0];
	act(() => button.props.onPress());
};

// Math.random is fed on purpose: the queue first, then a flat 0.5 for everything that does not matter (the dice tumble)
const randoms: number[] = [];
const feed = (...values: number[]) => randoms.push(...values);
/** The roll-off that lets white start (6 against 1), and the one that lets black start. */
const WHITE_STARTS = [0.9, 0.1];
const BLACK_STARTS = [0.1, 0.9];
/** 5 and 3, 6 and 1, 2 and 2 */
const ROLL_5_3 = [0.7, 0.4];
const ROLL_6_1 = [0.99, 0.01];
const ROLL_2_2 = [0.25, 0.25];

describe("BackgammonGame", () => {
	beforeEach(() => {
		jest.useFakeTimers();
		randoms.length = 0;
		jest.spyOn(Math, "random").mockImplementation(() => (randoms.length ? randoms.shift()! : 0.5));
		mockChannels.length = 0;
		mockStoredBotSettings = null;
		(submitMoreGameMatchResult as jest.Mock).mockClear();
		(recordMoreGameWin as jest.Mock).mockClear();
	});
	afterEach(() => {
		jest.useRealTimers();
		jest.restoreAllMocks();
	});

	async function mount() {
		let renderer!: ReactTestRenderer;
		await act(async () => {
			renderer = create(<BackgammonGame cosmetics={DEFAULT_EXTRA_COSMETICS} playerName="Tester" onRatingChange={jest.fn()} />);
		});
		return renderer;
	}
	const advance = async (ms: number) => {
		await act(async () => {
			jest.advanceTimersByTime(ms);
		});
	};

	it("draws the board, the roll-off and a roll button", async () => {
		feed(...WHITE_STARTS);
		const renderer = await mount();
		expect(renderer.root.findByProps({ testID: "backgammon-board" })).toBeTruthy();
		for (let point = 1; point <= 24; point += 1) expect(renderer.root.findByProps({ testID: `backgammon-point-${point}` })).toBeTruthy();
		const all = texts(renderer);
		expect(all).toContain("Roll dice");
		expect(all).toContain("Roll-off: white 6, black 1");
		expect(all).toContain("White to move");
		expect(all).toContain("To go: white 360, black 360");
	});

	it("plays a turn by taps: roll, pick the head, land on 19 and 16, then the turn passes to black", async () => {
		feed(...WHITE_STARTS);
		const renderer = await mount();
		feed(...ROLL_5_3);
		press(renderer, "Roll dice");
		await advance(700);
		expect(texts(renderer)).not.toContain("Roll-off");

		tapPoint(renderer, 24);
		tapPoint(renderer, 19);
		await advance(400);
		expect(texts(renderer)).toContain("To go: white 355, black 360");
		// the head is shut for the rest of the turn: tapping it picks nothing up, the moved checker goes on with the 3
		tapPoint(renderer, 24);
		tapPoint(renderer, 19);
		tapPoint(renderer, 16);
		await advance(400);
		expect(texts(renderer)).toContain("To go: white 352, black 360");
		// all dice are used: the turn ends by itself a moment later
		await advance(900);
		expect(texts(renderer)).toContain("Black to move");
		expect(texts(renderer)).toContain("To go: white 352, black 360");
	});

	it("undoes a move within the turn", async () => {
		feed(...WHITE_STARTS);
		const renderer = await mount();
		feed(...ROLL_5_3);
		press(renderer, "Roll dice");
		await advance(700);
		tapPoint(renderer, 24);
		tapPoint(renderer, 21);
		await advance(400);
		expect(texts(renderer)).toContain("To go: white 357, black 360");
		press(renderer, "Undo");
		expect(texts(renderer)).toContain("To go: white 360, black 360");
		// and the turn can be played another way
		tapPoint(renderer, 24);
		tapPoint(renderer, 19);
		await advance(400);
		expect(texts(renderer)).toContain("To go: white 355, black 360");
	});

	it("does not move a checker to a point the roll cannot reach", async () => {
		feed(...WHITE_STARTS);
		const renderer = await mount();
		feed(...ROLL_5_3);
		press(renderer, "Roll dice");
		await advance(700);
		tapPoint(renderer, 24);
		tapPoint(renderer, 20);
		await advance(400);
		expect(texts(renderer)).toContain("To go: white 360, black 360");
	});

	it("moves a checker by dragging it, for black on the same device", async () => {
		feed(...WHITE_STARTS);
		const renderer = await mount();
		feed(...ROLL_5_3);
		press(renderer, "Roll dice");
		await advance(700);
		// white drags its head checker to 21 (the 3), then the same checker on with the 5
		dragPoint(renderer, 24, 21);
		dragPoint(renderer, 21, 16);
		await advance(1200);
		expect(texts(renderer)).toContain("Black to move");
		// black's head stands on white's 12 (bottom left); 6 and 1 take one checker 24 -> 18 -> 17
		feed(...ROLL_6_1);
		press(renderer, "Roll dice");
		await advance(700);
		dragPoint(renderer, 12, 6);
		await advance(400);
		expect(texts(renderer)).toContain("To go: white 352, black 354");
	});

	it("makes the computer answer: it rolls, moves and hands the turn back", async () => {
		mockStoredBotSettings = JSON.stringify({ difficulty: "hard", vsBot: { backgammon: true } });
		feed(...BLACK_STARTS);
		const renderer = await mount();
		expect(texts(renderer)).toContain("Bot is thinking...");
		feed(...ROLL_6_1);
		// each step of the computer's turn starts from a state the previous step set, so time passes in small slices
		for (let slice = 0; slice < 40; slice += 1) await advance(125);
		const all = texts(renderer);
		expect(all).toContain("Your roll");
		// black moved 7 pips with its 6-1
		expect(all).toContain("To go: you 360, opponent 353");
	});

	describe("online", () => {
		const channelOf = () => mockChannels[mockChannels.length - 1];
		const deliver = async (event: string, payload: any, role = "player2") => {
			await act(async () => {
				channelOf().handlers["broadcast:mini_game"]({ payload: { event, payload, role, senderId: "guest-device" } });
			});
		};
		const sentEvents = (name: string) => channelOf().sent.filter((entry: any) => entry.event === name);

		async function hostAndJoin() {
			feed(...WHITE_STARTS);
			const renderer = await mount();
			feed(...WHITE_STARTS);
			press(renderer, "Host");
			await advance(10);
			await deliver("system_joined", { playerName: "Guest" });
			return renderer;
		}

		it("hosts a room, sends the position to the guest and plays a turn with roll and turn messages", async () => {
			const renderer = await hostAndJoin();
			expect(sentEvents("sync")).toHaveLength(1);
			const synced: BackgammonState = sentEvents("sync")[0].payload.state;
			expect(isValidState(synced)).toBe(true);
			expect(synced.turn).toBe("w");
			expect(texts(renderer)).toContain("Your roll");

			feed(...ROLL_5_3);
			press(renderer, "Roll dice");
			await advance(700);
			expect(sentEvents("roll")[0].payload).toEqual({ dice: [5, 3] });
			tapPoint(renderer, 24);
			tapPoint(renderer, 19);
			tapPoint(renderer, 19);
			tapPoint(renderer, 16);
			await advance(1500);
			const turn = sentEvents("turn")[0].payload;
			expect(turn.dice).toEqual([5, 3]);
			expect(turn.moves).toEqual([{ from: 24, to: 19, die: 5 }, { from: 19, to: 16, die: 3 }]);
			expect(turn.state.turn).toBe("b");
			expect(isValidState(turn.state)).toBe(true);
			expect(texts(renderer)).toContain("Opponent is rolling");
		});

		it("shows the guest's roll and replays the guest's turn on the board", async () => {
			const renderer = await hostAndJoin();
			feed(...ROLL_5_3);
			press(renderer, "Roll dice");
			await advance(700);
			tapPoint(renderer, 24);
			tapPoint(renderer, 19);
			tapPoint(renderer, 19);
			tapPoint(renderer, 16);
			await advance(1500);
			const after: BackgammonState = sentEvents("turn")[0].payload.state;

			// the guest (black) rolls 6-1 and plays 24 -> 18 -> 17
			await deliver("roll", { dice: [6, 1] });
			await advance(700);
			expect(texts(renderer)).toContain("Opponent's move");
			const moves: BgMove[] = [{ from: 24, to: 18, die: 6 }, { from: 18, to: 17, die: 1 }];
			await deliver("turn", { moves, dice: [6, 1], state: after });
			await advance(2000);
			expect(texts(renderer)).toContain("Your roll");
			expect(texts(renderer)).toContain("To go: you 352, opponent 353");
		});

		it("ignores a roll that is not the sender's to make, and a turn that is not legal", async () => {
			const renderer = await hostAndJoin();
			// it is white's turn: a roll from black means nothing
			await deliver("roll", { dice: [6, 6] });
			await advance(700);
			expect(texts(renderer)).toContain("Your roll");
			expect(texts(renderer)).toContain("To go: you 360, opponent 360");
			// a "turn" from black while white has to move is not taken as played
			await deliver("turn", { moves: [{ from: 24, to: 18, die: 6 }], dice: [6, 1] });
			await advance(2000);
			expect(texts(renderer)).toContain("To go: you 360, opponent 360");
		});

		it("bears checkers off by tapping the tray and by dragging a checker off the board", async () => {
			const renderer = await hostAndJoin();
			// white has everything home: 5 on its 6, 5 on its 3 and 5 on its 1; black still sits on its head
			const points = initialPosition().points.map(() => 0);
			points[5] = 5;
			points[2] = 5;
			points[0] = 5;
			points[11] = -15;
			const homeState: BackgammonState = { points, off: { w: 0, b: 0 }, turn: "w", dice: null, opening: null, turns: 60 };
			expect(isValidState(homeState)).toBe(true);
			await deliver("sync", { state: homeState });
			feed(0.99, 0.4); // 6 and 3
			press(renderer, "Roll dice");
			await advance(700);

			// nothing lights up the tray until a checker that can come off is picked up
			const tray = () => renderer.root.findAll((node) => node.props.testID === "backgammon-tray-bottom" && "disabled" in node.props)[0];
			expect(tray().props.disabled).toBe(true);
			tapPoint(renderer, 6);
			expect(tray().props.disabled).toBe(false);
			act(() => tray().props.onPress());
			await advance(400);
			expect(tray().props.accessibilityLabel).toBe("Borne off 1/15");
			expect(texts(renderer)).toContain("To go: you 44, opponent 360");

			// the 3: drag it from its point down past the board's edge
			const spot = at(3);
			touch(renderer, spot.x, spot.y, 0, m.innerH + 12 - spot.y);
			await advance(400);
			expect(tray().props.accessibilityLabel).toBe("Borne off 2/15");
			await advance(1000);
			expect(sentEvents("turn")[0].payload.moves).toEqual([{ from: 6, to: 0, die: 6 }, { from: 3, to: 0, die: 3 }]);
		});

		it("takes the opponent's win as a win when the opponent leaves", async () => {
			const renderer = await hostAndJoin();
			await deliver("system_left", { playerName: "Guest" });
			expect(texts(renderer)).toContain("P2 left. You win.");
		});

		it("reports a lost game to the server as a mars with the winner's side", async () => {
			const renderer = await hostAndJoin();
			// black has fourteen checkers off and one on its 1, white has borne off nothing: black's 2-2 ends the game
			const position = initialPosition();
			const points = position.points.map(() => 0);
			points[23] = 15;
			points[12] = -1;
			const nearlyDone: BackgammonState = { points, off: { w: 0, b: 14 }, turn: "b", dice: null, opening: null, turns: 99 };
			expect(isValidState(nearlyDone)).toBe(true);
			await deliver("sync", { state: nearlyDone });
			await deliver("roll", { dice: [2, 2] });
			await advance(700);
			await deliver("turn", { moves: [{ from: 1, to: 0, die: 2 }], dice: [2, 2], state: { ...nearlyDone, points: points.map((n, i) => (i === 12 ? 0 : n)), off: { w: 0, b: 15 } } });
			await advance(2000);
			expect(texts(renderer)).toContain("You lost");
			expect(texts(renderer)).toContain("Mars: 2 points");
			expect(submitMoreGameMatchResult).toHaveBeenCalledTimes(1);
			expect(submitMoreGameMatchResult).toHaveBeenCalledWith(expect.objectContaining({
				gameId: "backgammon",
				result: "player2",
				player1Name: "Tester",
				player2Name: "Guest",
				metadata: { mars: true, points: 2 },
			}));
			// the rematch button is there, and no win was counted
			expect(texts(renderer)).toContain("Rematch");
			expect(recordMoreGameWin).not.toHaveBeenCalled();
		});
	});
});
