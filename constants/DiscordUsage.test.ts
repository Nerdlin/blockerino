jest.mock("./Analytics", () => ({ track: jest.fn() }));

import { track } from "./Analytics";
import { discordSessionProps, discordUsageProps, reportDiscordSession, resetDiscordUsageForTests, shouldReportSession, trackDiscordFail, trackDiscordOpen } from "./DiscordUsage";

beforeEach(() => {
	(track as jest.Mock).mockClear();
	resetDiscordUsageForTests();
});

describe("discordUsageProps", () => {
	it("tells a server from a direct message", () => {
		expect(discordUsageProps({ guildId: "1234567890123456789", platform: "desktop" })).toEqual({ discord_surface: "guild", discord_platform: "desktop", discord_guild: "1234567890123456789" });
		expect(discordUsageProps({ guildId: null, platform: "mobile" })).toEqual({ discord_surface: "dm", discord_platform: "mobile", discord_guild: null });
	});

	it("does not trust odd values", () => {
		expect(discordUsageProps({ guildId: "<script>", platform: "toaster" })).toEqual({ discord_surface: "dm", discord_platform: "unknown", discord_guild: null });
		expect(discordUsageProps({})).toEqual({ discord_surface: "dm", discord_platform: "unknown", discord_guild: null });
	});
});

describe("trackDiscordOpen", () => {
	it("sends once per page load", () => {
		trackDiscordOpen({ guildId: "1234567890123456789", platform: "desktop" });
		trackDiscordOpen({ guildId: "1234567890123456789", platform: "desktop" });
		expect(track).toHaveBeenCalledTimes(1);
		expect(track).toHaveBeenCalledWith("discord_open", { discord_surface: "guild", discord_platform: "desktop", discord_guild: "1234567890123456789" }, { flush: true });
	});
});

describe("discord_session", () => {
	it("reports the first head count, then only real changes that are not too soon", () => {
		expect(shouldReportSession(null, 0, 2, 1000)).toBe(true);
		expect(shouldReportSession(2, 1000, 2, 90_000)).toBe(false);
		expect(shouldReportSession(2, 1000, 3, 5000)).toBe(false);
		expect(shouldReportSession(2, 1000, 3, 40_000)).toBe(true);
	});

	it("carries only a number and the surface, never ids", () => {
		expect(discordSessionProps(3, { guildId: "1234567890123456789" })).toEqual({ discord_players: 3, discord_surface: "guild" });
		expect(discordSessionProps(500, {})).toEqual({ discord_players: 99, discord_surface: "dm" });
		expect(discordSessionProps(Number.NaN, {})).toEqual({ discord_players: 0, discord_surface: "dm" });
	});

	it("sends the first count at once and folds quick changes into one later event", () => {
		jest.useFakeTimers();
		const sdk = { guildId: null };
		reportDiscordSession(1, sdk, 1000);
		reportDiscordSession(2, sdk, 2000);
		reportDiscordSession(3, sdk, 3000);
		expect(track).toHaveBeenCalledTimes(1);
		expect(track).toHaveBeenLastCalledWith("discord_session", { discord_players: 1, discord_surface: "dm" });
		jest.advanceTimersByTime(60_000);
		expect(track).toHaveBeenCalledTimes(2);
		expect(track).toHaveBeenLastCalledWith("discord_session", { discord_players: 3, discord_surface: "dm" });
		jest.useRealTimers();
	});
});

describe("trackDiscordFail", () => {
	it("names the stage where the Activity start stopped", () => {
		trackDiscordFail("authorize", { guildId: null });
		expect(track).toHaveBeenCalledWith("discord_fail", { stage: "authorize", discord_surface: "dm" }, { flush: true });
	});
});
