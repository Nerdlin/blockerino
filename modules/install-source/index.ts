import { requireOptionalNativeModule } from "expo-modules-core";

type PlayUpdateStatus = "available" | "in_progress" | "none" | "error";
export interface PlayUpdateInfo {
	status: PlayUpdateStatus;
	/** The Play build number of the waiting update (0 when there is none). */
	versionCode: number;
}
export type PlayUpdateResult = "ok" | "canceled" | "failed" | "none";

interface InstallSourceNative {
	getInstallerPackageName(): string | null;
	// since 2.0.9
	getPlayUpdate?(): Promise<PlayUpdateInfo>;
	startPlayUpdate?(): Promise<PlayUpdateResult>;
}

// Which store installed the app: "com.android.vending" for Google Play, null for an APK installed by hand (the GitHub
// release) or when it cannot tell. Builds without this module (before 2.0.5, web, tests) also give null.
const InstallSource = requireOptionalNativeModule<InstallSourceNative>("InstallSource");

export function getInstallerPackageName(): string | null {
	try {
		return InstallSource?.getInstallerPackageName() ?? null;
	} catch {
		return null;
	}
}

export const GOOGLE_PLAY_INSTALLER = "com.android.vending";

/** Whether this build can show Google Play's own update window (2.0.9 and newer). */
export function canUsePlayUpdates(): boolean {
	return typeof InstallSource?.getPlayUpdate === "function" && typeof InstallSource?.startPlayUpdate === "function";
}

/** Asks Google Play whether a newer build is out. Null when this build cannot ask. */
export async function getPlayUpdate(): Promise<PlayUpdateInfo | null> {
	if (!canUsePlayUpdates()) return null;
	try {
		return await InstallSource!.getPlayUpdate!();
	} catch {
		return { status: "error", versionCode: 0 };
	}
}

/** Shows Google Play's full-screen "Update available" window. */
export async function startPlayUpdate(): Promise<PlayUpdateResult> {
	if (!canUsePlayUpdates()) return "failed";
	try {
		return await InstallSource!.startPlayUpdate!();
	} catch {
		return "failed";
	}
}
