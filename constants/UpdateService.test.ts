const mockInstaller = { value: "com.android.vending" as string | null };
const mockGetPlayUpdate = jest.fn();
const mockStartPlayUpdate = jest.fn();
const mockOpenURL = jest.fn(() => Promise.resolve());
const mockAlert = jest.fn();
const mockFrom = jest.fn();

jest.mock("react-native", () => ({
	Platform: { OS: "android" },
	Alert: { alert: (...a: unknown[]) => mockAlert(...a) },
	Linking: { openURL: (...a: unknown[]) => (mockOpenURL as any)(...a) },
}));
jest.mock("expo-application", () => ({ nativeApplicationVersion: "2.0.9", nativeBuildVersion: "22", applicationId: "com.nerdlin.blockerino" }));
jest.mock("./Supabase", () => ({ supabase: { from: (...a: unknown[]) => mockFrom(...a) } }));
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
	updateService.resetSessionCheck();
});

test("a Play install gets Play's own update window, once per new build", async () => {
	mockGetPlayUpdate.mockResolvedValue({ status: "available", versionCode: 23 });
	mockStartPlayUpdate.mockResolvedValue("canceled");
	await updateService.checkForUpdates();
	expect(mockStartPlayUpdate).toHaveBeenCalledTimes(1);
	expect(mockFrom).not.toHaveBeenCalled(); // never our GitHub dialog

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
