// A tiny hub between the server client (which sees every failed request) and the connectivity cache
// (constants/NetworkStatus.ts), kept free of imports so neither has to load the other.

let listener: (() => void) | null = null;

export function setNetworkFailureListener(next: (() => void) | null): void {
	listener = next;
}

/** A request failed with a network error (not an abort). */
export function notifyNetworkFailure(): void {
	listener?.();
}
