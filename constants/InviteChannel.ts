import { supabase } from "./Supabase";
import { realtime, realtimeBackend, sendToInbox } from "./RoomSocket";

// Invitations go to the player's inbox "invites:<user id>": only its owner listens and only an accepted friend
// sends. On Supabase it is a private Realtime channel (policies on realtime.messages, migration 20261110134159);
// on the Cloudflare room worker the worker checks both (workers/rooms). While players move from one backend to
// the other, a sender on Cloudflare delivers to both inboxes; each app listens on just one, so nobody sees it twice.

export function inviteTopic(userId: string): string {
	return `invites:${userId}`;
}

/** The player's own inbox. Subscribe to it and listen for "broadcast" events. */
export function openInviteInbox(userId: string) {
	return realtime.channel(inviteTopic(userId), { config: { private: true } });
}

async function sendOnSupabase(friendId: string, event: string, payload: Record<string, unknown>): Promise<boolean> {
	const channel = supabase.channel(inviteTopic(friendId), { config: { private: true } });
	try {
		const result = await channel.httpSend(event, payload, { timeout: 5000 });
		return result.success;
	} catch {
		return false;
	} finally {
		supabase.removeChannel(channel);
	}
}

/** Delivers an invitation to a friend; false when no inbox took it. */
export async function sendInviteBroadcast(friendId: string, event: string, payload: Record<string, unknown>): Promise<boolean> {
	const sends = [sendOnSupabase(friendId, event, payload)];
	if (realtimeBackend() === "cloudflare") sends.push(sendToInbox(friendId, event, payload));
	return (await Promise.all(sends)).some(Boolean);
}
