import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { loadStoredLanguage } from "./Localization";
import { supabase } from "./Supabase";
import { track } from "./Analytics";

// Notifications, two ways to see the same thing (the server creates them, see the notifications migration):
//   * push: Android and iOS apps register an Expo push token (needs the player's permission and an account);
//   * in the app: every client, web and Discord included, reads its unread notifications when it opens.
// Everything here is safe to call anywhere: it never throws.

const TOKEN_KEY = "PUSH_TOKEN";
const ENABLED_KEY = "PUSH_ENABLED";
const PROMPTED_KEY = "PUSH_PROMPTED";

export type PushStatus = "enabled" | "denied" | "needs_account" | "unsupported" | "error";
export type PushPermission = "granted" | "denied" | "undetermined" | "unsupported";

export type NotificationKind = "overtaken" | "streak_risk" | "season_ending";

export interface AppNotification {
	id: number;
	kind: NotificationKind;
	payload: Record<string, unknown>;
	createdAt: string;
}

/** Push needs a native app: Expo push tokens do not exist on the web (nor in a Discord Activity). */
export function isPushSupported(): boolean {
	return Platform.OS === "android" || Platform.OS === "ios";
}

async function hasSession(): Promise<boolean> {
	try {
		const { data: { session } } = await supabase.auth.getSession();
		return Boolean(session?.user);
	} catch {
		return false;
	}
}

/** Call once at launch: how a push is shown while the app is open, and the Android channel. */
export async function setupNotifications(): Promise<void> {
	if (!isPushSupported()) return;
	try {
		Notifications.setNotificationHandler({
			handleNotification: async () => ({
				shouldShowBanner: true,
				shouldShowList: true,
				shouldPlaySound: false,
				shouldSetBadge: false,
			}),
		});
		if (Platform.OS === "android") {
			await Notifications.setNotificationChannelAsync("default", {
				name: "Blockerino",
				importance: Notifications.AndroidImportance.DEFAULT,
			});
		}
	} catch {
		// Without the module (old build) the app simply has no push.
	}
}

export async function getPushPermission(): Promise<PushPermission> {
	if (!isPushSupported()) return "unsupported";
	try {
		const { granted, canAskAgain } = await Notifications.getPermissionsAsync();
		if (granted) return "granted";
		return canAskAgain ? "undetermined" : "denied";
	} catch {
		return "unsupported";
	}
}

export async function isPushEnabled(): Promise<boolean> {
	try {
		return (await AsyncStorage.getItem(ENABLED_KEY)) === "true";
	} catch {
		return false;
	}
}

async function registerToken(requestPermission: boolean): Promise<PushStatus> {
	if (!isPushSupported()) return "unsupported";
	if (!(await hasSession())) return "needs_account";

	try {
		let { granted, canAskAgain } = await Notifications.getPermissionsAsync();
		if (!granted) {
			if (!requestPermission || !canAskAgain) return "denied";
			granted = (await Notifications.requestPermissionsAsync()).granted;
		}
		if (!granted) return "denied";

		const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
		if (!projectId) return "error";
		const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

		const { data: stored, error } = await supabase.rpc("register_push_token", {
			p_token: token,
			p_platform: Platform.OS,
			p_language: await loadStoredLanguage(),
		});
		if (error || stored !== true) return "error";

		await AsyncStorage.setItem(TOKEN_KEY, token);
		await AsyncStorage.setItem(ENABLED_KEY, "true");
		return "enabled";
	} catch {
		return "error";
	}
}

/** The player agreed: ask the system for permission if needed and register this device. */
export async function enablePush(): Promise<PushStatus> {
	const status = await registerToken(true);
	if (status === "enabled") track("push_enabled");
	if (status === "denied") {
		await AsyncStorage.setItem(ENABLED_KEY, "false").catch(() => undefined);
		track("push_denied");
	}
	return status;
}

/** Stops push for this device (the in-app inbox keeps working). */
export async function disablePush(): Promise<void> {
	try {
		const token = await AsyncStorage.getItem(TOKEN_KEY);
		if (token && (await hasSession())) {
			await supabase.rpc("unregister_push_token", { p_token: token });
		}
		await AsyncStorage.removeItem(TOKEN_KEY);
		await AsyncStorage.setItem(ENABLED_KEY, "false");
		track("push_disabled");
	} catch {
		// keep going: the flag below still stops us from re-registering
		await AsyncStorage.setItem(ENABLED_KEY, "false").catch(() => undefined);
	}
}

/** At launch and after signing in: keeps the registration (token, language) current without asking again. */
export async function refreshPushRegistration(): Promise<void> {
	if (!(await isPushEnabled())) return;
	await registerToken(false);
}

export async function wasPushOffered(): Promise<boolean> {
	try {
		return (await AsyncStorage.getItem(PROMPTED_KEY)) === "true";
	} catch {
		return true;
	}
}

export async function markPushOffered(): Promise<void> {
	try {
		await AsyncStorage.setItem(PROMPTED_KEY, "true");
	} catch {
		// worst case the offer is shown once more
	}
}

/** Should the game suggest push now: supported, signed in, not enabled, never asked before. */
export async function shouldOfferPush(): Promise<boolean> {
	if (!isPushSupported()) return false;
	if (await isPushEnabled()) return false;
	if (await wasPushOffered()) return false;
	return hasSession();
}

// ---- in-app inbox ---------------------------------------------------------------------------

const KINDS: NotificationKind[] = ["overtaken", "streak_risk", "season_ending"];

export function parseNotifications(data: unknown): AppNotification[] {
	if (!Array.isArray(data)) return [];
	const parsed: AppNotification[] = [];
	for (const row of data) {
		if (!row || typeof row !== "object") continue;
		const item = row as Record<string, unknown>;
		if (typeof item.id !== "number" || !KINDS.includes(item.kind as NotificationKind)) continue;
		parsed.push({
			id: item.id,
			kind: item.kind as NotificationKind,
			payload: item.payload && typeof item.payload === "object" ? (item.payload as Record<string, unknown>) : {},
			createdAt: typeof item.created_at === "string" ? item.created_at : "",
		});
	}
	return parsed;
}

/** Unread notifications, newest first. Empty for guests and when the server cannot be reached. */
export async function fetchNotifications(): Promise<AppNotification[]> {
	try {
		if (!(await hasSession())) return [];
		const { data, error } = await supabase.rpc("get_my_notifications");
		if (error) return [];
		return parseNotifications(data);
	} catch {
		return [];
	}
}

export async function markNotificationsRead(ids: number[]): Promise<void> {
	if (ids.length === 0) return;
	try {
		await supabase.rpc("mark_notifications_read", { p_ids: ids });
	} catch {
		// shown again next time, which is fine
	}
}
