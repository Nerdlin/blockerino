import { atom, useSetAtom } from "jotai";
import { useCallback } from "react";
import { supabase } from "./Supabase";
import { adoptGameRecords, getGameRecords, parseGameRecords, subscribeToRecordChanges, type GameRecords } from "./GameStats";

// Another player's profile, and the account side of "my profile": who may open it, and the per-game record that
// is pushed to the server. The server decides what a caller may see (get_public_profile), so this file only asks
// and shows the answer. Signed-in players push records; guests can still open profiles that are open to everyone.

export type ProfileVisibility = "everyone" | "friends" | "nobody";
export const PROFILE_VISIBILITIES: ProfileVisibility[] = ["everyone", "friends", "nobody"];
export type ProfileRelation = "self" | "friend" | "pending_out" | "pending_in" | "none";

export interface ProfileHighScores {
	classic: number;
	chaos: number;
	time_attack: number;
	daily: number;
	move_limit: number;
}

export interface ProfileAchievement {
	id: string;
	reward: number;
}

export interface PublicProfile {
	/** hidden = the player keeps the details private: only the name, avatar and relation are known. */
	status: "ok" | "hidden";
	userId: string | null;
	friendRowId: string | null;
	name: string;
	avatarUrl: string | null;
	relation: ProfileRelation;
	/** Only known for the player's own profile. */
	visibility: ProfileVisibility | null;
	elo: number | null;
	memberSince: string | null;
	highScores: ProfileHighScores | null;
	records: GameRecords;
	achievements: ProfileAchievement[];
}

/** Set by any list; PlayerProfileHost opens the profile of this nickname. */
export const viewedPlayerAtom = atom<string | null>(null);

export function useOpenPlayerProfile(): (name: string | null | undefined) => void {
	const setViewed = useSetAtom(viewedPlayerAtom);
	return useCallback(
		(name) => {
			const trimmed = name?.trim();
			if (trimmed) setViewed(trimmed);
		},
		[setViewed]
	);
}

function asNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asStringOrNull(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

export function isProfileVisibility(value: unknown): value is ProfileVisibility {
	return value === "everyone" || value === "friends" || value === "nobody";
}

/** Null for "not found" and for anything that is not an answer of the function. */
export function parsePublicProfile(data: unknown): PublicProfile | null {
	if (!data || typeof data !== "object") return null;
	const row = data as Record<string, unknown>;
	if (row.status !== "ok" && row.status !== "hidden") return null;
	const name = asStringOrNull(row.name);
	if (!name) return null;
	const relation: ProfileRelation =
		row.relation === "self" || row.relation === "friend" || row.relation === "pending_out" || row.relation === "pending_in" ? row.relation : "none";
	const scores = row.highscores && typeof row.highscores === "object" ? (row.highscores as Record<string, unknown>) : null;
	const achievements = Array.isArray(row.achievements)
		? row.achievements
				.map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : null))
				.filter((item): item is Record<string, unknown> => !!item && typeof item.id === "string")
				.map((item) => ({ id: item.id as string, reward: asNumber(item.reward) }))
				.slice(0, 3)
		: [];
	return {
		status: row.status,
		userId: asStringOrNull(row.user_id),
		friendRowId: asStringOrNull(row.friend_row_id),
		name,
		avatarUrl: asStringOrNull(row.avatar_url),
		relation,
		visibility: isProfileVisibility(row.visibility) ? row.visibility : null,
		elo: row.status === "ok" && typeof row.elo === "number" ? row.elo : null,
		memberSince: asStringOrNull(row.member_since),
		highScores: scores
			? {
					classic: asNumber(scores.classic),
					chaos: asNumber(scores.chaos),
					time_attack: asNumber(scores.time_attack),
					daily: asNumber(scores.daily),
					move_limit: asNumber(scores.move_limit),
				}
			: null,
		records: parseGameRecords(row.records ? JSON.stringify(row.records) : null),
		achievements,
	};
}

export type ProfileLoad = { kind: "ok"; profile: PublicProfile } | { kind: "not_found" } | { kind: "error" };

export async function fetchPublicProfile(name: string): Promise<ProfileLoad> {
	try {
		const { data, error } = await supabase.rpc("get_public_profile", { p_name: name });
		if (error) return { kind: "error" };
		if (data && typeof data === "object" && (data as { status?: unknown }).status === "not_found") return { kind: "not_found" };
		const profile = parsePublicProfile(data);
		return profile ? { kind: "ok", profile } : { kind: "error" };
	} catch {
		return { kind: "error" };
	}
}

/** Null for guests and when the server cannot be reached. */
export async function getProfileVisibility(): Promise<ProfileVisibility | null> {
	try {
		const { data: { session } } = await supabase.auth.getSession();
		if (!session?.user) return null;
		const { data, error } = await supabase.rpc("get_profile_visibility");
		if (error || !data || typeof data !== "object") return null;
		const value = (data as Record<string, unknown>).visibility;
		return isProfileVisibility(value) ? value : null;
	} catch {
		return null;
	}
}

export async function setProfileVisibility(value: ProfileVisibility): Promise<boolean> {
	try {
		const { data, error } = await supabase.rpc("set_profile_visibility", { p_value: value });
		return !error && !!data && (data as Record<string, unknown>).status === "ok";
	} catch {
		return false;
	}
}

// ---- Friend actions from a profile (the friends table is protected by its own row-level rules) ----

export async function sendFriendRequestTo(targetUserId: string): Promise<boolean> {
	try {
		const { data: { session } } = await supabase.auth.getSession();
		if (!session?.user || session.user.id === targetUserId) return false;
		const { error } = await supabase.from("friends").insert({ user_id_1: session.user.id, user_id_2: targetUserId, status: "pending" });
		return !error;
	} catch {
		return false;
	}
}

export async function acceptFriendRequest(rowId: string): Promise<boolean> {
	try {
		const { error } = await supabase.from("friends").update({ status: "accepted" }).eq("id", rowId);
		return !error;
	} catch {
		return false;
	}
}

/** Cancels a request, declines one, or removes a friend: all three delete the row. */
export async function deleteFriendRow(rowId: string): Promise<boolean> {
	try {
		const { error } = await supabase.from("friends").delete().eq("id", rowId);
		return !error;
	} catch {
		return false;
	}
}

// ---- Per-game record sync ----

const PUSH_DELAY_MS = 5000;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let syncing: Promise<void> | null = null;

/** Sends the device's counters, adopts what the account holds (the larger counter wins). Silent for guests. */
export function syncGameRecords(): Promise<void> {
	if (syncing) return syncing;
	syncing = (async () => {
		try {
			const { data: { session } } = await supabase.auth.getSession();
			if (!session?.user) return;
			const local = await getGameRecords();
			const { data, error } = await supabase.rpc("sync_game_records", { p_records: local });
			if (error || !data || typeof data !== "object" || (data as Record<string, unknown>).status !== "ok") return;
			const remote = (data as Record<string, unknown>).records;
			await adoptGameRecords(parseGameRecords(remote ? JSON.stringify(remote) : null));
		} catch {
			// the next result or the next start tries again
		} finally {
			syncing = null;
		}
	})();
	return syncing;
}

function schedulePush() {
	if (pushTimer) clearTimeout(pushTimer);
	pushTimer = setTimeout(() => {
		pushTimer = null;
		void syncGameRecords();
	}, PUSH_DELAY_MS);
}

// A finished game schedules a push; importing this module is what turns it on.
subscribeToRecordChanges(schedulePush);
