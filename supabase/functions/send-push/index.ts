// Delivers pending notifications as push messages through the Expo push service.
// Called every minute by pg_cron (see docs/push-notifications.md) with the header x-cron-secret; nobody
// else can trigger it. Reads user_notifications / push_tokens with the service role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildMessage, type Lang } from "./messages.ts";

const EXPO_PUSH_URL = Deno.env.get("EXPO_PUSH_URL") ?? "https://exp.host/--/api/v2/push/send";
const BATCH = 100;
// A notification that could not be pushed within this window is stale; it stays in the in-app inbox only.
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

interface PendingNotification {
	id: number;
	profile_id: string;
	kind: string;
	payload: Record<string, unknown>;
	created_at: string;
}

interface TokenRow {
	token: string;
	profile_id: string;
	language: string;
}

interface ExpoTicket {
	status: "ok" | "error";
	details?: { error?: string };
}

Deno.serve(async (req) => {
	const secret = Deno.env.get("CRON_SECRET");
	if (!secret || req.headers.get("x-cron-secret") !== secret) {
		return new Response("forbidden", { status: 403 });
	}

	const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
		auth: { persistSession: false },
	});

	const { data: pending, error } = await supabase
		.from("user_notifications")
		.select("id, profile_id, kind, payload, created_at")
		.is("pushed_at", null)
		.order("created_at", { ascending: true })
		.limit(200);
	if (error) return json({ error: error.message }, 500);
	const notifications = (pending ?? []) as PendingNotification[];
	if (notifications.length === 0) return json({ pending: 0, sent: 0 });

	const profileIds = [...new Set(notifications.map((n) => n.profile_id))];
	const { data: tokenRows, error: tokenError } = await supabase
		.from("push_tokens")
		.select("token, profile_id, language")
		.in("profile_id", profileIds);
	if (tokenError) return json({ error: tokenError.message }, 500);
	const tokensByProfile = new Map<string, TokenRow[]>();
	for (const row of (tokenRows ?? []) as TokenRow[]) {
		tokensByProfile.set(row.profile_id, [...(tokensByProfile.get(row.profile_id) ?? []), row]);
	}

	const now = Date.now();
	const messages: Record<string, unknown>[] = [];
	for (const notification of notifications) {
		if (now - Date.parse(notification.created_at) > MAX_AGE_MS) continue;
		for (const token of tokensByProfile.get(notification.profile_id) ?? []) {
			const text = buildMessage(notification.kind, notification.payload ?? {}, (token.language === "ru" ? "ru" : "en") as Lang);
			if (!text) continue;
			messages.push({
				to: token.token,
				title: text.title,
				body: text.body,
				sound: "default",
				priority: "high",
				channelId: "default",
				data: { notificationId: notification.id, kind: notification.kind },
			});
		}
	}

	let sent = 0;
	const deadTokens: string[] = [];
	for (let i = 0; i < messages.length; i += BATCH) {
		const batch = messages.slice(i, i + BATCH);
		try {
			const response = await fetch(EXPO_PUSH_URL, {
				method: "POST",
				headers: { Accept: "application/json", "Content-Type": "application/json" },
				body: JSON.stringify(batch),
			});
			if (!response.ok) {
				console.error("Expo push request failed:", response.status);
				continue;
			}
			const body = await response.json();
			const tickets = (body?.data ?? []) as ExpoTicket[];
			tickets.forEach((ticket, index) => {
				if (ticket.status === "ok") sent += 1;
				else if (ticket.details?.error === "DeviceNotRegistered") deadTokens.push(String(batch[index].to));
			});
		} catch (err) {
			console.error("Expo push request error:", err);
			// The batch stays unsent; the notifications below are still marked, see the comment there.
		}
	}

	if (deadTokens.length > 0) {
		await supabase.from("push_tokens").delete().in("token", deadTokens);
	}

	// Every notification is marked handled, also when it had no token (the player may have push switched
	// off) or the Expo call failed: the in-app inbox still has it, and retrying forever would spam later.
	await supabase
		.from("user_notifications")
		.update({ pushed_at: new Date().toISOString() })
		.in("id", notifications.map((n) => n.id));

	return json({ pending: notifications.length, sent, removedTokens: deadTokens.length });
});

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
