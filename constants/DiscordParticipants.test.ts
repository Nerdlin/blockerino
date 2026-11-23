jest.mock("./DiscordUsage", () => ({ reportDiscordSession: jest.fn() }));

import { reportDiscordSession } from "./DiscordUsage";
import {
	attachDiscordParticipants,
	discordAvatarUrl,
	getOtherParticipants,
	getParticipantCount,
	normalizeParticipants,
	resetDiscordParticipantsForTests,
	setDiscordSelfId,
} from "./DiscordParticipants";

beforeEach(() => {
	resetDiscordParticipantsForTests();
	(reportDiscordSession as jest.Mock).mockClear();
});

describe("normalizeParticipants", () => {
	it("prefers nickname, then global name, then username, and skips bots and bad rows", () => {
		const people = normalizeParticipants([
			{ id: "11111111111", username: "u1", global_name: "Global", nickname: "Nick", avatar: "abc" },
			{ id: "22222222222", username: "u2", global_name: "Only Global" },
			{ id: "33333333333", username: "u3" },
			{ id: "44444444444", username: "bot", bot: true },
			{ id: "bad", username: "x" },
			{ id: "55555555555", username: "  " },
			null,
			"junk",
		]);
		expect(people.map((p) => p.name)).toEqual(["Nick", "Only Global", "u3"]);
		expect(people[0].avatarUrl).toBe("https://cdn.discordapp.com/avatars/11111111111/abc.png?size=64");
		expect(people[1].avatarUrl).toBeNull();
	});

	it("keeps one row per person and caps the list", () => {
		expect(normalizeParticipants([{ id: "11111111111", username: "a" }, { id: "11111111111", username: "b" }])).toHaveLength(1);
		const many = Array.from({ length: 80 }, (_, i) => ({ id: String(10000000 + i), username: `p${i}` }));
		expect(normalizeParticipants(many)).toHaveLength(50);
		expect(normalizeParticipants("nope")).toEqual([]);
	});

	it("does not build avatar links from odd values", () => {
		expect(discordAvatarUrl("11111111111", "../x")).toBeNull();
		expect(discordAvatarUrl("abc", "hash")).toBeNull();
		expect(discordAvatarUrl("11111111111", null)).toBeNull();
	});
});

describe("attachDiscordParticipants", () => {
	it("loads the list, follows updates, reports the head count and hides the player themselves", async () => {
		let listener: (data: { participants: unknown[] }) => void = () => undefined;
		const sdk = {
			guildId: null,
			commands: { getInstanceConnectedParticipants: jest.fn().mockResolvedValue({ participants: [{ id: "11111111111", username: "me" }, { id: "22222222222", username: "friend" }] }) },
			subscribe: jest.fn(async (_event: string, cb: (data: { participants: unknown[] }) => void) => { listener = cb; }),
		};
		await attachDiscordParticipants(sdk);
		expect(getParticipantCount()).toBe(2);
		expect(reportDiscordSession).toHaveBeenLastCalledWith(2, sdk);
		setDiscordSelfId("11111111111");
		expect(getOtherParticipants().map((p) => p.name)).toEqual(["friend"]);
		listener({ participants: [{ id: "11111111111", username: "me" }] });
		expect(getOtherParticipants()).toEqual([]);
		expect(reportDiscordSession).toHaveBeenLastCalledWith(1, sdk);
	});

	it("survives a failing SDK", async () => {
		const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
		const sdk = {
			commands: { getInstanceConnectedParticipants: jest.fn().mockRejectedValue(new Error("no")) },
			subscribe: jest.fn().mockRejectedValue(new Error("no")),
		};
		await expect(attachDiscordParticipants(sdk)).resolves.toBeUndefined();
		expect(getParticipantCount()).toBe(0);
		warn.mockRestore();
	});
});
