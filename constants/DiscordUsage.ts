import { track } from "./Analytics";

// Where a Discord Activity is opened: in a server's voice channel, or in a DM / group chat. Recorded once per session through the
// same switch as the other usage statistics ("Help improve the game" in Options). The server id is stored as is, without the
// account (the server drops it for this event) and is deleted after 90 days.

type ActivityLocation = object; // the Discord SDK on the web, an empty mock on native

let sent = false;

export function discordUsageProps(source: ActivityLocation): { discord_surface: "guild" | "dm"; discord_platform: string; discord_guild: string | null } {
	const sdk = source as { guildId?: unknown; platform?: unknown };
	const guild = typeof sdk.guildId === "string" && /^\d{5,25}$/.test(sdk.guildId) ? sdk.guildId : null;
	const platform = sdk.platform === "mobile" || sdk.platform === "desktop" ? sdk.platform : "unknown";
	return { discord_surface: guild ? "guild" : "dm", discord_platform: platform, discord_guild: guild };
}

/** Sends the event once per page load. Never throws. */
export function trackDiscordOpen(sdk: ActivityLocation): void {
	if (sent) return;
	sent = true;
	try {
		track("discord_open", discordUsageProps(sdk));
	} catch {
		// statistics must never break the Activity
	}
}

export function resetDiscordUsageForTests(): void {
	sent = false;
}
