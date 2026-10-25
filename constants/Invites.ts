import { supabase } from "./Supabase";
import { GameModeType } from "@/hooks/useAppState";

// The server side of a 1v1 invite: the push for a friend whose app is closed (notify_invite), the invites waiting
// when the app opens (get_my_pending_invites) and the "online" marks of friends (touch_presence / get_friends_online).
// Every call is safe to make anywhere: it never throws.

export interface PendingInvite {
	id: number;
	roomId: string;
	from: string;
	mode: GameModeType;
}

export function parsePendingInvites(data: unknown): PendingInvite[] {
	if (!Array.isArray(data)) return [];
	const result: PendingInvite[] = [];
	for (const item of data) {
		if (!item || typeof item !== "object") continue;
		const row = item as Record<string, unknown>;
		if (typeof row.id !== "number" || typeof row.room_id !== "string" || row.room_id.length === 0) continue;
		result.push({
			id: row.id,
			roomId: row.room_id,
			from: typeof row.from === "string" ? row.from : "",
			mode: row.mode === GameModeType.Chaos ? GameModeType.Chaos : GameModeType.Classic,
		});
	}
	return result;
}

export function parseOnlineIds(data: unknown): Set<string> {
	return new Set(Array.isArray(data) ? data.filter((id): id is string => typeof id === "string") : []);
}

/** Tells the server to push the invite to the friend. Silent on failure: the live message still goes out. */
export async function notifyInvite(roomId: string, friendUserId: string): Promise<void> {
	try {
		await supabase.rpc("notify_invite", { p_room_id: roomId, p_friend_user_id: friendUserId });
	} catch {
		// the live invite does not depend on this
	}
}

export async function fetchPendingInvites(): Promise<PendingInvite[]> {
	try {
		const { data, error } = await supabase.rpc("get_my_pending_invites");
		return error ? [] : parsePendingInvites(data);
	} catch {
		return [];
	}
}

export async function markInvitesRead(ids: number[]): Promise<void> {
	if (ids.length === 0) return;
	try {
		await supabase.rpc("mark_notifications_read", { p_ids: ids });
	} catch {
		// the invite is only offered for 3 minutes anyway
	}
}

export async function touchPresence(): Promise<void> {
	try {
		const { data: { session } } = await supabase.auth.getSession();
		if (session?.user) await supabase.rpc("touch_presence");
	} catch {
		// presence is a nicety
	}
}

export async function fetchFriendsOnline(): Promise<Set<string>> {
	try {
		const { data, error } = await supabase.rpc("get_friends_online");
		return error ? new Set() : parseOnlineIds(data);
	} catch {
		return new Set();
	}
}
