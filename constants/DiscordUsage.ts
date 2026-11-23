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
		track("discord_open", discordUsageProps(sdk), { flush: true });
	} catch {
		// statistics must never break the Activity
	}
}

/** Where a failed Activity start stopped, so "opened but never got in" is visible next to the opens. */
export type DiscordFailStage = "ready" | "authorize" | "exchange" | "authenticate" | "sign_in";

export function trackDiscordFail(stage: DiscordFailStage, sdk?: ActivityLocation): void {
	try {
		track("discord_fail", { stage, discord_surface: sdk ? discordUsageProps(sdk).discord_surface : undefined }, { flush: true });
	} catch {
		// statistics must never break the Activity
	}
}

// How many people are in this Activity at once. Only a number and the surface go out, never who they are.
const SESSION_MIN_GAP_MS = 30_000;
const MAX_REPORTED_PLAYERS = 99;

/** True when a new head count is worth an event: the first one, or a changed one that is not too soon after the last. */
export function shouldReportSession(lastCount: number | null, lastAt: number, count: number, now: number): boolean {
	if (lastCount === null) return true;
	return count !== lastCount && now - lastAt >= SESSION_MIN_GAP_MS;
}

export function discordSessionProps(count: number, sdk: ActivityLocation): { discord_players: number; discord_surface: "guild" | "dm" } {
	const players = Number.isFinite(count) ? Math.max(0, Math.min(MAX_REPORTED_PLAYERS, Math.floor(count))) : 0;
	return { discord_players: players, discord_surface: discordUsageProps(sdk).discord_surface };
}

let lastCount: number | null = null;
let lastAt = 0;
let trailing: ReturnType<typeof setTimeout> | undefined;

/** Call whenever the participant list changes. Rapid changes are folded into one trailing event. */
export function reportDiscordSession(count: number, sdk: ActivityLocation, now: number = Date.now()): void {
	try {
		if (trailing !== undefined) {
			clearTimeout(trailing);
			trailing = undefined;
		}
		if (shouldReportSession(lastCount, lastAt, count, now)) {
			lastCount = count;
			lastAt = now;
			track("discord_session", discordSessionProps(count, sdk));
		} else if (count !== lastCount) {
			// changed too soon after the last event: send the latest value once the gap has passed
			trailing = setTimeout(() => reportDiscordSession(count, sdk), Math.max(0, SESSION_MIN_GAP_MS - (now - lastAt)) + 50);
		}
	} catch {
		// statistics must never break the Activity
	}
}

export function resetDiscordUsageForTests(): void {
	sent = false;
	lastCount = null;
	lastAt = 0;
	if (trailing !== undefined) clearTimeout(trailing);
	trailing = undefined;
}
