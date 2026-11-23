// A small cache around "is the server reachable?": the answer is kept for a few seconds so that every screen can
// ask without a new network round trip (and without waiting for a 12 s timeout each time). Pure: the probe and the
// clock are passed in, so it is tested without a network.

export type ConnectivityProbe = () => Promise<boolean>;

export interface ConnectivityCacheOptions {
	/** How long a "reachable" answer is trusted. */
	onlineTtlMs?: number;
	/** How long an "unreachable" answer is trusted; short, so coming back online is noticed quickly. */
	offlineTtlMs?: number;
	now?: () => number;
}

export interface ConnectivityCache {
	/** The answer; reuses a fresh cached one, and shares one probe between simultaneous callers. */
	check(force?: boolean): Promise<boolean>;
	/** The last answer without asking again; null before the first check. */
	peek(): boolean | null;
	/** Records what a real request just showed (a failed fetch means offline, a successful one online). */
	report(online: boolean): void;
	subscribe(listener: (online: boolean) => void): () => void;
}

export function createConnectivityCache(probe: ConnectivityProbe, options: ConnectivityCacheOptions = {}): ConnectivityCache {
	const onlineTtl = options.onlineTtlMs ?? 20000;
	const offlineTtl = options.offlineTtlMs ?? 3000;
	const now = options.now ?? Date.now;
	let value: boolean | null = null;
	let checkedAt = 0;
	let inFlight: Promise<boolean> | null = null;
	const listeners = new Set<(online: boolean) => void>();

	const set = (online: boolean) => {
		const changed = value !== online;
		value = online;
		checkedAt = now();
		if (changed) listeners.forEach((listener) => listener(online));
	};

	return {
		check(force = false) {
			if (!force && value !== null && now() - checkedAt < (value ? onlineTtl : offlineTtl)) return Promise.resolve(value);
			if (inFlight) return inFlight;
			inFlight = probe()
				.catch(() => false)
				.then((online) => {
					set(online);
					return online;
				})
				.finally(() => {
					inFlight = null;
				});
			return inFlight;
		},
		peek: () => value,
		report: set,
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}
