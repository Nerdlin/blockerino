import { useCallback, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import { checkSupabaseConnectionDetails } from "./Connectivity";
import { setNetworkFailureListener } from "./NetworkFailure";
import { createConnectivityCache } from "./ConnectivityCache";

// One shared answer to "is the server reachable?". The probe waits at most 4 s (an airplane-mode phone fails at
// once, a bad network is not allowed to hold a screen for 15 s), and the answer is cached for a few seconds.

const PROBE_TIMEOUT_MS = 4000;

const cache = createConnectivityCache(async () => {
	if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.onLine === false) return false;
	const result = await checkSupabaseConnectionDetails(PROBE_TIMEOUT_MS);
	// an HTTP error still means the server answered, so the network is there
	return result.online || result.reason === "supabase_error";
});

// a failed request already says "offline": no need for another probe
setNetworkFailureListener(() => cache.report(false));

/** Resolves true when the server answers. Cheap to call often. */
export function isOnline(force = false): Promise<boolean> {
	return cache.check(force);
}

/** The last known answer (null until the first check). */
export function peekOnline(): boolean | null {
	return cache.peek();
}

/** Call after a real request failed with a network error or succeeded. */
export function reportOnline(online: boolean): void {
	cache.report(online);
}

let watching = false;
function startWatching() {
	if (watching) return;
	watching = true;
	if (Platform.OS === "web" && typeof window !== "undefined") {
		window.addEventListener("online", () => void cache.check(true));
		window.addEventListener("offline", () => cache.report(false));
	}
	AppState.addEventListener("change", (state) => {
		if (state === "active") void cache.check(true);
	});
}

/**
 * The reachability for a screen: `online` is null until the first answer (treat as "unknown", do not warn yet).
 * While offline it re-checks every 8 s, so the screen recovers by itself when the network returns.
 */
export function useOnlineStatus(): { online: boolean | null; checking: boolean; recheck: () => void } {
	const [online, setOnline] = useState<boolean | null>(cache.peek());
	const [checking, setChecking] = useState(false);

	const recheck = useCallback(() => {
		setChecking(true);
		void cache.check(true).then((value) => {
			setOnline(value);
			setChecking(false);
		});
	}, []);

	useEffect(() => {
		startWatching();
		let alive = true;
		const unsubscribe = cache.subscribe((value) => alive && setOnline(value));
		void cache.check().then((value) => alive && setOnline(value));
		const timer = setInterval(() => void cache.check(), 8000);
		return () => {
			alive = false;
			unsubscribe();
			clearInterval(timer);
		};
	}, []);

	return { online, checking, recheck };
}
