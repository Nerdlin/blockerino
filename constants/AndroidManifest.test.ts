import fs from "fs";
import path from "path";

// The native Android project is committed, so app.json alone does not decide how the release build behaves.
const manifest = fs.readFileSync(path.join(__dirname, "..", "android", "app", "src", "main", "AndroidManifest.xml"), "utf8");
const meta = (name: string) => manifest.match(new RegExp(`android:name="${name.replace(/\./g, "\\.")}" android:value="([^"]*)"`))?.[1];

describe("Android release manifest", () => {
	it("checks for updates over the air at every launch", () => {
		// ERROR_RECOVERY_ONLY (June-Nov 2026) meant installed apps never downloaded a published EAS update.
		expect(meta("expo.modules.updates.ENABLED")).toBe("true");
		expect(meta("expo.modules.updates.EXPO_UPDATES_CHECK_ON_LAUNCH")).toBe("ALWAYS");
		expect(meta("expo.modules.updates.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY")).toContain("production");
	});

	it("does not ask for a foreground media service (the game never plays in the background)", () => {
		expect(manifest).not.toMatch(/android:name="android\.permission\.FOREGROUND_SERVICE_MEDIA_PLAYBACK"(?![^>]*tools:node="remove")/);
	});
});
