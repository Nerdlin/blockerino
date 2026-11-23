import type { Session } from '@supabase/supabase-js';
import { supabase } from './Supabase';
import { isOnline } from './NetworkStatus';

// A guest gets an invisible anonymous account for online matches only (rooms and match channels can then tell
// players apart). Everywhere else the game treats that session as "not signed in".

export function isAnonymousSession(session: Session | null | undefined): boolean {
	return Boolean(session?.user?.is_anonymous);
}

/** The session as the auth client saved it (JSON in storage); null when it is missing or broken. Pure. */
export function sessionFromStoredValue(raw: string | null | undefined): Session | null {
	if (!raw) return null;
	try {
		const value = JSON.parse(raw);
		const session = value && typeof value === "object" && "currentSession" in value ? value.currentSession : value;
		if (session && typeof session === "object" && typeof session.access_token === "string" && session.user && typeof session.user.id === "string") return session as Session;
	} catch {
		// unreadable: treat as no saved session
	}
	return null;
}

async function readSavedSession(): Promise<Session | null> {
	try {
		const auth = supabase.auth as unknown as { storage?: { getItem(key: string): Promise<string | null> | string | null }; storageKey?: string };
		if (!auth.storage || !auth.storageKey) return null;
		return sessionFromStoredValue(await auth.storage.getItem(auth.storageKey));
	} catch {
		return null;
	}
}

/** The session of a signed-in player; a guest's anonymous session reads as none. Same shape as auth.getSession(). */
export async function getAccountSession(): ReturnType<typeof supabase.auth.getSession> {
	// Offline, supabase.auth.getSession() tries to refresh an expired token and waits ~30 s before giving up, which
	// freezes every screen that asks who the player is. Use the saved session as it is instead.
	if (!(await isOnline())) {
		const saved = await readSavedSession();
		if (saved) return { data: { session: isAnonymousSession(saved) ? null : saved }, error: null } as Awaited<ReturnType<typeof supabase.auth.getSession>>;
	}
	const result = await supabase.auth.getSession();
	if (isAnonymousSession(result.data.session)) {
		return { ...result, data: { session: null } } as Awaited<ReturnType<typeof supabase.auth.getSession>>;
	}
	return result;
}

/** A signed-in player's session as is; a guest's anonymous one as null. */
export function accountSessionOf(session: Session | null | undefined): Session | null {
	return session && !isAnonymousSession(session) ? session : null;
}

let pending: Promise<string | null> | null = null;

/**
 * The id the player sits in online rooms under: the account id when signed in, otherwise an anonymous account
 * made on first use. Null when the server does not allow anonymous sign-ins (then the old device id is used).
 */
export function ensureOnlineIdentity(): Promise<string | null> {
	if (pending) return pending;
	pending = (async () => {
		try {
			const { data } = await supabase.auth.getSession();
			if (data.session?.user?.id) return data.session.user.id;
			const { data: created, error } = await supabase.auth.signInAnonymously();
			if (error) return null;
			return created.user?.id ?? null;
		} catch {
			return null;
		} finally {
			pending = null;
		}
	})();
	return pending;
}
