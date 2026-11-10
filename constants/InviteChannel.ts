import { supabase } from "./Supabase";

// Invitations travel on the Realtime channel "invites:<user id>". It is a private channel: only its owner can
// listen to it and only accepted friends can send to it (policies on realtime.messages, migration
// 20261110140000). Builds before 2.0.8 still listen on the public channel of the same name, so a sender
// also delivers there until those builds are gone.

export function inviteTopic(userId: string): string {
	return `invites:${userId}`;
}

/** The player's own inbox. Subscribe to it and listen for "broadcast" events. */
export function openInviteInbox(userId: string) {
	return supabase.channel(inviteTopic(userId), { config: { private: true } });
}

async function sendOnPrivateChannel(friendId: string, event: string, payload: Record<string, unknown>): Promise<boolean> {
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

async function sendOnLegacyChannel(friendId: string, event: string, payload: Record<string, unknown>): Promise<boolean> {
	const channel = supabase.channel(inviteTopic(friendId));
	try {
		const subscribed = await new Promise<boolean>((resolve) => {
			const timeout = setTimeout(() => resolve(false), 5000);
			channel.subscribe((status) => {
				if (status === "SUBSCRIBED") {
					clearTimeout(timeout);
					resolve(true);
				} else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
					clearTimeout(timeout);
					resolve(false);
				}
			});
		});
		if (!subscribed) return false;
		return (await channel.send({ type: "broadcast", event, payload })) === "ok";
	} catch {
		return false;
	} finally {
		supabase.removeChannel(channel);
	}
}

/** Delivers an invitation to a friend; false when it reached neither the private nor the old public inbox. */
export async function sendInviteBroadcast(friendId: string, event: string, payload: Record<string, unknown>): Promise<boolean> {
	const [privateSent, legacySent] = await Promise.all([
		sendOnPrivateChannel(friendId, event, payload),
		sendOnLegacyChannel(friendId, event, payload),
	]);
	return privateSent || legacySent;
}
