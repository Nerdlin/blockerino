import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { isAnalyticsEnabled } from "./Analytics";
import { supabase } from "./Supabase";

// First-party crash reports (see the crash_reports migration). Same rules as the usage statistics: our own
// Supabase table, nothing personal, off when the player switches "Usage statistics" off in Options.
// A crash can kill the app before anything is sent, so every report is written to storage first and sent on the
// next start. Every function here is safe to call anywhere: it never throws.

const DEVICE_ID_KEY = "ANALYTICS_DEVICE_ID";
const QUEUE_KEY = "CRASH_REPORT_QUEUE";
const MAX_QUEUE = 20;
const MAX_BATCH = 10;
const MAX_PER_SESSION = 8;
const FLUSH_INTERVAL_MS = 60000;
const MAX_MESSAGE = 300;
const MAX_STACK = 2000;

export interface CrashReport {
	device_id: string;
	fingerprint: string;
	message: string;
	stack: string | null;
	screen: string | null;
	fatal: boolean;
	client_time: string;
	platform: string;
	app_version: string;
	os_version: string;
}

let queue: CrashReport[] = [];
let queueLoaded: Promise<void> | null = null;
let currentScreen: string | null = null;
let sentThisSession = 0;
let flushing = false;
let installed = false;
const recentFingerprints = new Set<string>();

export function setCrashScreen(screen: string | null): void {
	currentScreen = screen;
}

/** Same error, same fingerprint: a short hash of the message and the first stack lines. */
export function fingerprintOf(message: string, stack?: string | null): string {
	const source = `${message}|${(stack ?? "").split("\n").slice(0, 3).join("|")}`;
	let hash = 5381;
	for (let i = 0; i < source.length; i++) hash = ((hash * 33) ^ source.charCodeAt(i)) >>> 0;
	return hash.toString(36);
}

export function normalizeError(error: unknown): { message: string; stack: string | null } {
	if (error instanceof Error) {
		return { message: (error.message || error.name || "Error").slice(0, MAX_MESSAGE), stack: error.stack ? error.stack.slice(0, MAX_STACK) : null };
	}
	if (typeof error === "string") return { message: error.slice(0, MAX_MESSAGE) || "Error", stack: null };
	try {
		return { message: JSON.stringify(error).slice(0, MAX_MESSAGE) || "Error", stack: null };
	} catch {
		return { message: "Unknown error", stack: null };
	}
}

async function loadQueue(): Promise<void> {
	if (!queueLoaded) {
		queueLoaded = (async () => {
			try {
				const raw = await AsyncStorage.getItem(QUEUE_KEY);
				const parsed = raw ? JSON.parse(raw) : [];
				if (Array.isArray(parsed)) queue = [...parsed, ...queue].slice(-MAX_QUEUE);
			} catch {
				// a damaged queue is simply dropped
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
		// best effort
	}
}

async function getDeviceId(): Promise<string> {
	try {
		const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
		if (stored) return stored;
		const created = Crypto.randomUUID();
		await AsyncStorage.setItem(DEVICE_ID_KEY, created);
		return created;
	} catch {
		return Crypto.randomUUID();
	}
}

export async function reportError(error: unknown, fatal = false): Promise<void> {
	try {
		if (!(await isAnalyticsEnabled())) return;
		const { message, stack } = normalizeError(error);
		const fingerprint = fingerprintOf(message, stack);
		// The same error in a render loop would otherwise fill the queue; fatal ones are always kept.
		if (!fatal && (recentFingerprints.has(fingerprint) || sentThisSession >= MAX_PER_SESSION)) return;
		recentFingerprints.add(fingerprint);
		sentThisSession += 1;
		await loadQueue();
		queue.push({
			device_id: await getDeviceId(),
			fingerprint,
			message,
			stack,
			screen: currentScreen,
			fatal,
			client_time: new Date().toISOString(),
			platform: Platform.OS,
			app_version: Constants.expoConfig?.version ?? "unknown",
			os_version: String(Platform.Version ?? "").slice(0, 24),
		});
		if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
		await persistQueue();
	} catch {
		// reporting must never cause another crash
	}
}

export async function flushCrashReports(): Promise<void> {
	if (flushing) return;
	flushing = true;
	try {
		await loadQueue();
		while (queue.length > 0) {
			if (!(await isAnalyticsEnabled())) {
				queue = [];
				await persistQueue();
				return;
			}
			const batch = queue.slice(0, MAX_BATCH);
			const { error } = await supabase.rpc("report_crashes", { p_reports: batch });
			if (error) return; // keep them and try again later
			queue = queue.slice(batch.length);
			await persistQueue();
		}
	} catch {
		// offline: keep the queue
	} finally {
		flushing = false;
	}
}

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;

/** Call once when the app starts: hooks uncaught errors, then sends whatever the last run left behind. */
export function startCrashReporting(): () => void {
	if (installed) return () => undefined;
	installed = true;
	const cleanups: Array<() => void> = [];

	const errorUtils = (globalThis as {
		ErrorUtils?: { getGlobalHandler: () => GlobalErrorHandler; setGlobalHandler: (handler: GlobalErrorHandler) => void };
	}).ErrorUtils;
	if (errorUtils) {
		const previous = errorUtils.getGlobalHandler();
		errorUtils.setGlobalHandler((error, isFatal) => {
			void reportError(error, !!isFatal);
			previous?.(error, isFatal);
		});
		cleanups.push(() => errorUtils.setGlobalHandler(previous));
	}

	if (Platform.OS === "web" && typeof window !== "undefined" && window.addEventListener) {
		const onError = (event: ErrorEvent) => void reportError(event.error ?? event.message, true);
		const onRejection = (event: PromiseRejectionEvent) => void reportError(event.reason, false);
		window.addEventListener("error", onError);
		window.addEventListener("unhandledrejection", onRejection);
		cleanups.push(() => {
			window.removeEventListener("error", onError);
			window.removeEventListener("unhandledrejection", onRejection);
		});
	}

	void flushCrashReports();
	const timer = setInterval(() => void flushCrashReports(), FLUSH_INTERVAL_MS);
	return () => {
		installed = false;
		clearInterval(timer);
		cleanups.forEach((fn) => fn());
	};
}

/** Test helper: forget in-memory state. */
export function resetCrashReportsForTests(): void {
	queue = [];
	queueLoaded = null;
	currentScreen = null;
	sentThisSession = 0;
	flushing = false;
	installed = false;
	recentFingerprints.clear();
}
