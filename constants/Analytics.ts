import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import { AppState as NativeAppState, Platform } from "react-native";
import { supabase } from "./Supabase";

// First-party usage statistics. Events go to our own Supabase table (see the analytics_events migration),
// never to a third party. Nothing personal is sent: a random device id the app makes for itself, screens,
// game modes, scores. A signed-in account id is attached by the server, not by the app.
// Every function here is safe to call anywhere: it never throws and never blocks the UI.

const DEVICE_ID_KEY = "ANALYTICS_DEVICE_ID";
const ENABLED_KEY = "ANALYTICS_ENABLED";
const QUEUE_KEY = "ANALYTICS_QUEUE";

const MAX_QUEUE = 200;
const MAX_BATCH = 50;
const FLUSH_INTERVAL_MS = 20000;
const FLUSH_AT = 20;
const SESSION_GAP_MS = 30 * 60 * 1000;
const MAX_PROPS = 12;
const MAX_STRING = 100;

export type EventProps = Record<string, string | number | boolean | null | undefined>;

interface QueuedEvent {
	name: string;
	client_time: string;
	device_id: string;
	session_id: string;
	platform: string;
	app_version: string;
	props: Record<string, string | number | boolean | null>;
}

let deviceId: string | null = null;
let enabled: boolean | null = null;
let queue: QueuedEvent[] = [];
let queueLoaded: Promise<void> | null = null;
let sessionId = "";
let lastEventAt = 0;
let flushing = false;
let started = false;

/** Keeps only small primitive values so an event can never carry something personal or huge. */
export function sanitizeProps(props?: EventProps): QueuedEvent["props"] {
	const clean: QueuedEvent["props"] = {};
	if (!props) return clean;
	for (const [key, value] of Object.entries(props)) {
		if (Object.keys(clean).length >= MAX_PROPS) break;
		if (!/^[a-z][a-z0-9_]{0,29}$/.test(key)) continue;
		if (typeof value === "string") clean[key] = value.slice(0, MAX_STRING);
		else if (typeof value === "number" && Number.isFinite(value)) clean[key] = value;
		else if (typeof value === "boolean" || value === null) clean[key] = value;
	}
	return clean;
}

async function loadQueue(): Promise<void> {
	if (!queueLoaded) {
		queueLoaded = (async () => {
			try {
				const raw = await AsyncStorage.getItem(QUEUE_KEY);
				const parsed = raw ? JSON.parse(raw) : [];
				if (Array.isArray(parsed)) queue = [...parsed, ...queue].slice(-MAX_QUEUE);
			} catch {
				// A damaged queue is simply dropped.
			}
		})();
	}
	return queueLoaded;
}

async function persistQueue(): Promise<void> {
	try {
		if (queue.length === 0) await AsyncStorage.removeItem(QUEUE_KEY);
		else await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
	} catch {
		// Statistics are best effort.
	}
}

async function getDeviceId(): Promise<string> {
	if (deviceId) return deviceId;
	try {
		const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
		if (stored) {
			deviceId = stored;
			return stored;
		}
	} catch {
		// fall through and make a new one
	}
	deviceId = Crypto.randomUUID();
	try {
		await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
	} catch {
		// The id then lives only until the app closes.
	}
	return deviceId;
}

export async function isAnalyticsEnabled(): Promise<boolean> {
	if (enabled !== null) return enabled;
	try {
		enabled = (await AsyncStorage.getItem(ENABLED_KEY)) !== "false";
	} catch {
		enabled = true;
	}
	return enabled;
}

/** Players can switch collection off in Options; switching off also forgets everything not yet sent. */
export async function setAnalyticsEnabled(next: boolean): Promise<void> {
	enabled = next;
	try {
		await AsyncStorage.setItem(ENABLED_KEY, next ? "true" : "false");
	} catch {
		// keep the in-memory choice
	}
	if (!next) {
		queue = [];
		await persistQueue();
	}
}

function currentSessionId(now: number): string {
	if (!sessionId || now - lastEventAt > SESSION_GAP_MS) sessionId = Crypto.randomUUID();
	lastEventAt = now;
	return sessionId;
}

export function track(name: string, props?: EventProps): void {
	void (async () => {
		try {
			if (!(await isAnalyticsEnabled())) return;
			await loadQueue();
			const now = Date.now();
			queue.push({
				name,
				client_time: new Date(now).toISOString(),
				device_id: await getDeviceId(),
				session_id: currentSessionId(now),
				platform: Platform.OS,
				app_version: Constants.expoConfig?.version ?? "unknown",
				props: sanitizeProps(props),
			});
			if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
			await persistQueue();
			if (queue.length >= FLUSH_AT) void flushAnalytics();
		} catch {
			// never let statistics break the app
		}
	})();
}

export async function flushAnalytics(): Promise<void> {
	if (flushing) return;
	flushing = true;
	try {
		await loadQueue();
		while (queue.length > 0 && (await isAnalyticsEnabled())) {
			const batch = queue.slice(0, MAX_BATCH);
			const { error } = await supabase.rpc("track_events", { p_events: batch });
			if (error) return; // keep the events and try again on the next tick
			queue = queue.slice(batch.length);
			await persistQueue();
		}
	} catch {
		// offline: keep the queue
	} finally {
		flushing = false;
	}
}

/** Call once when the app starts. */
export function startAnalytics(): () => void {
	if (started) return () => undefined;
	started = true;

	track("app_open");
	const timer = setInterval(() => void flushAnalytics(), FLUSH_INTERVAL_MS);
	const appStateSub = NativeAppState.addEventListener("change", (state) => {
		if (state !== "active") void flushAnalytics();
	});

	return () => {
		started = false;
		clearInterval(timer);
		appStateSub.remove();
	};
}

/** Test helper: forget in-memory state. */
export function resetAnalyticsForTests(): void {
	deviceId = null;
	enabled = null;
	queue = [];
	queueLoaded = null;
	sessionId = "";
	lastEventAt = 0;
	flushing = false;
	started = false;
}
