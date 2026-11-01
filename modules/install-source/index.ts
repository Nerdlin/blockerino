import { requireOptionalNativeModule } from "expo-modules-core";

// Which store installed the app: "com.android.vending" for Google Play, null for an APK installed by hand (the GitHub
// release) or when it cannot tell. Builds without this module (before 2.0.5, web, tests) also give null.
const InstallSource = requireOptionalNativeModule<{ getInstallerPackageName(): string | null }>("InstallSource");

export function getInstallerPackageName(): string | null {
	try {
		return InstallSource?.getInstallerPackageName() ?? null;
	} catch {
		return null;
	}
}

export const GOOGLE_PLAY_INSTALLER = "com.android.vending";
