const mockStore = new Map<string, string>();
const mockRpc = jest.fn();
const mockGetSession = jest.fn();
const mockGetPermissions = jest.fn();
const mockRequestPermissions = jest.fn();
const mockGetToken = jest.fn();

jest.mock("@react-native-async-storage/async-storage", () => ({
	__esModule: true,
	default: {
		getItem: jest.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
		setItem: jest.fn((key: string, value: string) => {
			mockStore.set(key, value);
			return Promise.resolve();
		}),
		removeItem: jest.fn((key: string) => {
			mockStore.delete(key);
			return Promise.resolve();
		}),
	},
}));
jest.mock("expo-constants", () => ({
	__esModule: true,
	default: { expoConfig: { extra: { eas: { projectId: "project-1" } } } },
}));
jest.mock("expo-notifications", () => ({
	getPermissionsAsync: (...args: unknown[]) => mockGetPermissions(...args),
	requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissions(...args),
	getExpoPushTokenAsync: (...args: unknown[]) => mockGetToken(...args),
	setNotificationChannelAsync: jest.fn(),
	setNotificationHandler: jest.fn(),
	AndroidImportance: { DEFAULT: 3 },
}));
jest.mock("./Supabase", () => ({
	supabase: {
		rpc: (...args: unknown[]) => mockRpc(...args),
		auth: { getSession: () => mockGetSession() },
	},
}));
jest.mock("./Analytics", () => ({ track: jest.fn() }));

import { Platform } from "react-native";
import {
	disablePush,
	enablePush,
	fetchNotifications,
	markNotificationsRead,
	parseNotifications,
	refreshPushRegistration,
	shouldOfferPush,
} from "./Notifications";

const originalOS = Platform.OS;
function setOS(os: string) {
	Object.defineProperty(Platform, "OS", { value: os, configurable: true });
}

beforeEach(() => {
	mockStore.clear();
	jest.clearAllMocks();
	setOS("android");
	mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
	mockGetPermissions.mockResolvedValue({ granted: true, canAskAgain: true });
	mockRequestPermissions.mockResolvedValue({ granted: true });
	mockGetToken.mockResolvedValue({ data: "ExponentPushToken[abcdefghij1234567890]" });
	mockRpc.mockResolvedValue({ data: true, error: null });
});

afterAll(() => setOS(originalOS));

describe("enablePush", () => {
	it("registers the device token with the player's language", async () => {
		mockStore.set("APP_LANGUAGE", "ru");
		expect(await enablePush()).toBe("enabled");
		expect(mockRpc).toHaveBeenCalledWith("register_push_token", {
			p_token: "ExponentPushToken[abcdefghij1234567890]",
			p_platform: "android",
			p_language: "ru",
		});
		expect(mockStore.get("PUSH_ENABLED")).toBe("true");
		expect(mockStore.get("PUSH_TOKEN")).toBe("ExponentPushToken[abcdefghij1234567890]");
	});

	it("asks for permission when it is not granted yet", async () => {
		mockGetPermissions.mockResolvedValue({ granted: false, canAskAgain: true });
		expect(await enablePush()).toBe("enabled");
		expect(mockRequestPermissions).toHaveBeenCalled();
	});

	it("reports a refusal and does not register", async () => {
		mockGetPermissions.mockResolvedValue({ granted: false, canAskAgain: true });
		mockRequestPermissions.mockResolvedValue({ granted: false });
		expect(await enablePush()).toBe("denied");
		expect(mockRpc).not.toHaveBeenCalled();
		expect(mockStore.get("PUSH_ENABLED")).toBe("false");
	});

	it("does not ask again once the system blocked the question", async () => {
		mockGetPermissions.mockResolvedValue({ granted: false, canAskAgain: false });
		expect(await enablePush()).toBe("denied");
		expect(mockRequestPermissions).not.toHaveBeenCalled();
	});

	it("needs an account", async () => {
		mockGetSession.mockResolvedValue({ data: { session: null } });
		expect(await enablePush()).toBe("needs_account");
		expect(mockRpc).not.toHaveBeenCalled();
	});

	it("is unsupported on the web", async () => {
		setOS("web");
		expect(await enablePush()).toBe("unsupported");
		expect(mockGetPermissions).not.toHaveBeenCalled();
	});

	it("reports an error when the server refuses the token", async () => {
		mockRpc.mockResolvedValue({ data: false, error: null });
		expect(await enablePush()).toBe("error");
		expect(mockStore.get("PUSH_ENABLED")).toBeUndefined();
	});
});

describe("disablePush and refresh", () => {
	it("unregisters the stored token and stays off", async () => {
		await enablePush();
		mockRpc.mockClear();
		await disablePush();
		expect(mockRpc).toHaveBeenCalledWith("unregister_push_token", { p_token: "ExponentPushToken[abcdefghij1234567890]" });
		expect(mockStore.get("PUSH_ENABLED")).toBe("false");
		expect(mockStore.has("PUSH_TOKEN")).toBe(false);

		mockRpc.mockClear();
		await refreshPushRegistration();
		expect(mockRpc).not.toHaveBeenCalled();
	});

	it("re-registers silently at launch when push is on", async () => {
		await enablePush();
		mockRpc.mockClear();
		mockRequestPermissions.mockClear();
		await refreshPushRegistration();
		expect(mockRpc).toHaveBeenCalledWith("register_push_token", expect.any(Object));
		expect(mockRequestPermissions).not.toHaveBeenCalled();
	});
});

describe("shouldOfferPush", () => {
	it("offers once to a signed-in player on a native app", async () => {
		expect(await shouldOfferPush()).toBe(true);
		mockStore.set("PUSH_PROMPTED", "true");
		expect(await shouldOfferPush()).toBe(false);
	});

	it("never offers to guests, on the web or when already on", async () => {
		mockGetSession.mockResolvedValue({ data: { session: null } });
		expect(await shouldOfferPush()).toBe(false);
		mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
		mockStore.set("PUSH_ENABLED", "true");
		expect(await shouldOfferPush()).toBe(false);
		mockStore.clear();
		setOS("web");
		expect(await shouldOfferPush()).toBe(false);
	});
});

describe("in-app inbox", () => {
	it("keeps only well-formed notifications of known kinds", () => {
		expect(
			parseNotifications([
				{ id: 1, kind: "overtaken", payload: { by: "A" }, created_at: "2026-10-20T10:00:00Z" },
				{ id: 2, kind: "something_new", payload: {} },
				{ id: "3", kind: "streak_risk", payload: {} },
				{ id: 4, kind: "season_ending", payload: null },
				null,
			])
		).toEqual([
			{ id: 1, kind: "overtaken", payload: { by: "A" }, createdAt: "2026-10-20T10:00:00Z" },
			{ id: 4, kind: "season_ending", payload: {}, createdAt: "" },
		]);
		expect(parseNotifications("nope")).toEqual([]);
	});

	it("is empty for guests and on errors, and marks notifications read", async () => {
		mockGetSession.mockResolvedValue({ data: { session: null } });
		expect(await fetchNotifications()).toEqual([]);
		expect(mockRpc).not.toHaveBeenCalled();

		mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
		mockRpc.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
		expect(await fetchNotifications()).toEqual([]);

		mockRpc.mockResolvedValueOnce({ data: [{ id: 7, kind: "streak_risk", payload: { streak: 5 }, created_at: "x" }], error: null });
		expect((await fetchNotifications())[0].id).toBe(7);

		await markNotificationsRead([7, 8]);
		expect(mockRpc).toHaveBeenLastCalledWith("mark_notifications_read", { p_ids: [7, 8] });
		await markNotificationsRead([]);
		expect(mockRpc).toHaveBeenCalledTimes(3);
	});
});
