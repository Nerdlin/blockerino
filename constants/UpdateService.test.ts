const mockInstaller = { value: "com.android.vending" as string | null };
const mockGetPlayUpdate = jest.fn();
const mockStartPlayUpdate = jest.fn();
const mockOpenURL = jest.fn(() => Promise.resolve());
const mockAlert = jest.fn();
const mockStorage = new Map<string, string>();

jest.mock("react-native", () => ({
	Platform: { OS: "android" },
	Alert: { alert: (...a: unknown[]) => mockAlert(...a) },
	Linking: { openURL: (...a: unknown[]) => (mockOpenURL as any)(...a) },
}));
jest.mock("expo-application", () => ({ nativeApplicationVersion: "2.0.9", nativeBuildVersion: "22", applicationId: "com.nerdlin.blockerino" }));
jest.mock("./GameDialog", () => ({ gameAlert: (...a: unknown[]) => mockAlert(...a) }));
jest.mock("@react-native-async-storage/async-storage", () => ({
	__esModule: true,
	default: {
		getItem: async (key: string) => mockStorage.get(key) ?? null,
		setItem: async (key: string, value: string) => { mockStorage.set(key, value); },
	},
}));
jest.mock("./Localization", () => ({ loadStoredLanguage: async () => "en", translate: (_l: string, key: string) => key }));
jest.mock("@/modules/install-source", () => ({
	GOOGLE_PLAY_INSTALLER: "com.android.vending",
	getInstallerPackageName: () => mockInstaller.value,
	getPlayUpdate: () => mockGetPlayUpdate(),
	startPlayUpdate: () => mockStartPlayUpdate(),
}));

import { updateService } from "./UpdateService";

beforeEach(() => {
	jest.clearAllMocks();
	mockInstaller.value = "com.android.vending";
	mockStorage.clear();
	(global as any).__DEV__ = false;
	updateService.resetSessionCheck();
});

test("a Play install gets Play's own update window, once per new build", async () => {
	mockGetPlayUpdate.mockResolvedValue({ status: "available", versionCode: 23 });
	mockStartPlayUpdate.mockResolvedValue("canceled");
	await updateService.checkForUpdates();
	expect(mockStartPlayUpdate).toHaveBeenCalledTimes(1);
	expect(mockAlert).not.toHaveBeenCalled(); // never our own dialog

	// the player said "later": automatic checks do not repeat it for the same build
	updateService["lastCheckAt"] = 0;
	await updateService.checkForUpdates();
	expect(mockStartPlayUpdate).toHaveBeenCalledTimes(1);

	// a manual check always shows it
	await updateService.checkForUpdates(true);
	expect(mockStartPlayUpdate).toHaveBeenCalledTimes(2);
});

test("an update already started is always resumed", async () => {
	mockGetPlayUpdate.mockResolvedValue({ status: "in_progress", versionCode: 23 });
	mockStartPlayUpdate.mockResolvedValue("ok");
	await updateService.checkForUpdates();
	updateService["lastCheckAt"] = 0;
	await updateService.checkForUpdates();
	expect(mockStartPlayUpdate).toHaveBeenCalledTimes(2);
});

test("manual check: up to date message; an old build without the window opens the Play page", async () => {
	mockGetPlayUpdate.mockResolvedValue({ status: "none", versionCode: 0 });
	await updateService.checkForUpdates(true);
	expect(mockAlert).toHaveBeenCalledWith("update.upToDateTitle", "update.upToDate");
	expect(mockStartPlayUpdate).not.toHaveBeenCalled();

	mockGetPlayUpdate.mockResolvedValue(null);
	await updateService.checkForUpdates(true);
	expect(mockOpenURL).toHaveBeenCalledWith("market://details?id=com.nerdlin.blockerino");
});

test("automatic check with nothing new stays silent", async () => {
	mockGetPlayUpdate.mockResolvedValue({ status: "none", versionCode: 0 });
	await updateService.checkForUpdates();
	expect(mockAlert).not.toHaveBeenCalled();
	expect(mockOpenURL).not.toHaveBeenCalled();
});

test("an APK from GitHub is pointed to Google Play once, and a manual check opens the store page", async () => {
	mockInstaller.value = null;
	await updateService.checkForUpdates();
	expect(mockAlert).toHaveBeenCalledTimes(1);
	expect(mockAlert.mock.calls[0][0]).toBe("update.playTitle");
	expect(mockGetPlayUpdate).not.toHaveBeenCalled();

	// the next launch stays silent
	await updateService.checkForUpdates();
	expect(mockAlert).toHaveBeenCalledTimes(1);

	// the dialog's button opens the store
	const buttons = mockAlert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
	buttons.find((button) => button.text === "update.playOpen")!.onPress!();
	await Promise.resolve();
	expect(mockOpenURL).toHaveBeenCalledWith("market://details?id=com.nerdlin.blockerino");

	// a manual check goes straight to the store
	mockOpenURL.mockClear();
	await updateService.checkForUpdates(true);
	expect(mockOpenURL).toHaveBeenCalledWith("market://details?id=com.nerdlin.blockerino");
});

test("a development build is never pointed to the store", async () => {
	mockInstaller.value = null;
	(global as any).__DEV__ = true;
	await updateService.checkForUpdates();
	expect(mockAlert).not.toHaveBeenCalled();
});
