jest.mock("@/hooks/useAppState", () => ({ GameModeType: { Classic: "classic", Chaos: "chaos" } }));

import { buildDiscordDuelInvite, discordDuelTopic, parseDiscordDuelAnswer, parseDiscordDuelInvite } from "./DiscordDuel";
import { GameModeType } from "@/hooks/useAppState";

const ROOM = "123e4567-e89b-12d3-a456-426614174000";

describe("discordDuelTopic", () => {
	it("names a room channel after the instance and refuses odd ids", () => {
		expect(discordDuelTopic("i-1234abcd")).toBe("room:discord-i-1234abcd");
		expect(discordDuelTopic("a b/c:d!1234")).toBe("room:discord-abcd1234");
		expect(discordDuelTopic("ab")).toBeNull();
		expect(discordDuelTopic(undefined)).toBeNull();
		expect(discordDuelTopic("x".repeat(300))!.length).toBeLessThanOrEqual(96);
	});
});

describe("parseDiscordDuelInvite", () => {
	const invite = buildDiscordDuelInvite("22222222222", "11111111111", ROOM, "Alice", GameModeType.Chaos);

	it("accepts a challenge addressed to this player", () => {
		expect(parseDiscordDuelInvite(invite, "22222222222")).toEqual({ roomId: ROOM, hostName: "Alice", mode: GameModeType.Chaos, fromId: "11111111111" });
	});

	it("ignores challenges for someone else, from oneself, or malformed", () => {
		expect(parseDiscordDuelInvite(invite, "33333333333")).toBeNull();
		expect(parseDiscordDuelInvite(invite, null)).toBeNull();
		expect(parseDiscordDuelInvite({ ...invite, from: "22222222222" }, "22222222222")).toBeNull();
		expect(parseDiscordDuelInvite({ ...invite, roomId: "nope" }, "22222222222")).toBeNull();
		expect(parseDiscordDuelInvite({ ...invite, from: "x" }, "22222222222")).toBeNull();
		expect(parseDiscordDuelInvite("junk", "22222222222")).toBeNull();
	});

	it("falls back to Classic and a plain name", () => {
		const loose = parseDiscordDuelInvite({ ...invite, mode: "mahjong", hostName: "  " }, "22222222222");
		expect(loose).toMatchObject({ mode: GameModeType.Classic, hostName: "Player" });
	});
});

describe("parseDiscordDuelAnswer", () => {
	it("reads the room only when the answer is addressed to this host", () => {
		expect(parseDiscordDuelAnswer({ to: "11111111111", roomId: ROOM }, "11111111111")).toBe(ROOM);
		expect(parseDiscordDuelAnswer({ to: "11111111111", roomId: ROOM }, "22222222222")).toBeNull();
		expect(parseDiscordDuelAnswer({ to: "11111111111", roomId: "x" }, "11111111111")).toBeNull();
	});
});
