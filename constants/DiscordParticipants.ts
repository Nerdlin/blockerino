import { reportDiscordSession } from "./DiscordUsage";

// Who is in this Discord Activity right now: nicknames and avatars of the people in the voice channel / chat who opened the
// game. Kept in memory only, it is shown in the lobby ("challenge to a duel") and never sent anywhere; the usage statistics get
// just the head count (see DiscordUsage.reportDiscordSession).

export interface DiscordParticipant {
	id: string;
	name: string;
	avatarUrl: string | null;
}

export interface ParticipantsSdk {
	guildId?: string | null;
	commands: { getInstanceConnectedParticipants: () => Promise<{ participants: unknown[] }> };
	subscribe: (event: "ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE", listener: (data: { participants: unknown[] }) => void) => Promise<unknown>;
}

const MAX_PARTICIPANTS = 50;

export function discordAvatarUrl(id: string, avatar: string | null | undefined): string | null {
	if (!/^\d{5,25}$/.test(id) || !avatar || !/^[a-zA-Z0-9_]{1,64}$/.test(avatar)) return null;
	return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=64`;
}

/** Turns the list the SDK gives into what the UI shows. Skips bots and broken rows, keeps one row per person. */
export function normalizeParticipants(raw: unknown): DiscordParticipant[] {
	if (!Array.isArray(raw)) return [];
	const seen = new Set<string>();
	const people: DiscordParticipant[] = [];
	for (const item of raw) {
		if (!item || typeof item !== "object") continue;
		const row = item as Record<string, unknown>;
		const id = typeof row.id === "string" ? row.id : "";
		if (!/^\d{5,25}$/.test(id) || seen.has(id) || row.bot === true) continue;
		const nickname = typeof row.nickname === "string" ? row.nickname : "";
		const globalName = typeof row.global_name === "string" ? row.global_name : "";
		const username = typeof row.username === "string" ? row.username : "";
		const name = (nickname || globalName || username).trim().slice(0, 32);
		if (!name) continue;
		seen.add(id);
		people.push({ id, name, avatarUrl: discordAvatarUrl(id, typeof row.avatar === "string" ? row.avatar : null) });
		if (people.length >= MAX_PARTICIPANTS) break;
	}
	return people;
}

let participants: DiscordParticipant[] = [];
let selfId: string | null = null;
const listeners = new Set<() => void>();
let attached = false;

function publish(next: DiscordParticipant[], sdk: ParticipantsSdk): void {
	participants = next;
	reportDiscordSession(next.length, sdk);
	listeners.forEach((listener) => listener());
}

/** Remembers which participant is the player themselves (they are not shown as someone to challenge). */
export function setDiscordSelfId(id: string | null | undefined): void {
	selfId = typeof id === "string" ? id : null;
	listeners.forEach((listener) => listener());
}

export function getDiscordSelfId(): string | null {
	return selfId;
}

/** The others in the Activity (the player is left out when known). */
export function getOtherParticipants(): DiscordParticipant[] {
	return selfId ? participants.filter((person) => person.id !== selfId) : participants;
}

export function getParticipantCount(): number {
	return participants.length;
}

export function subscribeParticipants(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** Loads the list once and keeps it fresh. Never throws: a failure just leaves the list empty. */
export async function attachDiscordParticipants(sdk: ParticipantsSdk): Promise<void> {
	if (attached) return;
	attached = true;
	try {
		const first = await sdk.commands.getInstanceConnectedParticipants();
		publish(normalizeParticipants(first?.participants), sdk);
	} catch (error) {
		console.warn("Discord participants unavailable:", error);
	}
	try {
		await sdk.subscribe("ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE", (data) => publish(normalizeParticipants(data?.participants), sdk));
	} catch (error) {
		console.warn("Discord participants updates unavailable:", error);
	}
}

export function resetDiscordParticipantsForTests(): void {
	participants = [];
	selfId = null;
	attached = false;
	listeners.clear();
}
