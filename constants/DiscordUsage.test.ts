jest.mock("./Analytics", () => ({ track: jest.fn() }));

import { track } from "./Analytics";
import { discordUsageProps, resetDiscordUsageForTests, trackDiscordOpen } from "./DiscordUsage";

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
		expect(track).toHaveBeenCalledWith("discord_open", { discord_surface: "guild", discord_platform: "desktop", discord_guild: "1234567890123456789" });
	});
});
