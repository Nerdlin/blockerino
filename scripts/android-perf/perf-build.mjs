// node scripts/android-perf/perf-build.mjs setup | teardown
// setup: adds the temporary "perf" build type (release code, package com.nerdlin.blockerino.perf, OTA off) described in README.md
// teardown: puts android/app/build.gradle back and removes android/app/src/perf. Never commit the result of setup.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const gradle = join(root, "android", "app", "build.gradle");
const perfDir = join(root, "android", "app", "src", "perf");
const mode = process.argv[2];

if (mode === "setup") {
	let text = readFileSync(gradle, "utf8");
	if (!text.includes("TEMP-PERF-APK")) {
		const next = text.replace(/(\n(\s*)release \{\r?\n\s*signingConfig signingConfigs\.release[\s\S]*?\n\2\})/, (match, block, indent) =>
			`${block}\n${indent}perf { // TEMP-PERF-APK\n${indent}    initWith release\n${indent}    signingConfig signingConfigs.debug\n${indent}    applicationIdSuffix ".perf"\n${indent}    matchingFallbacks = ["release"]\n${indent}}`);
		if (next === text) throw new Error("could not find the release build type in android/app/build.gradle");
		writeFileSync(gradle, next);
	}
	mkdirSync(perfDir, { recursive: true });
	writeFileSync(join(perfDir, "AndroidManifest.xml"), `<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">
  <!-- debuggable only so run-as can seed the saved game; native code and the JS bundle stay release builds -->
  <application android:debuggable="true" tools:replace="android:debuggable">
    <meta-data android:name="expo.modules.updates.ENABLED" android:value="false" tools:replace="android:value"/>
  </application>
</manifest>
`);
	const services = readFileSync(join(root, "android", "app", "google-services.json"), "utf8");
	writeFileSync(join(perfDir, "google-services.json"), services.replaceAll('"com.nerdlin.blockerino.dev"', '"com.nerdlin.blockerino.perf"'));
	console.log("perf build type ready: cd android && ./gradlew assemblePerf -x lint -x lintVitalPerf -x lintVitalAnalyzePerf -x lintVitalReportPerf");
} else if (mode === "teardown") {
	execFileSync("git", ["checkout", "--", "android/app/build.gradle"], { cwd: root });
	if (existsSync(perfDir)) rmSync(perfDir, { recursive: true, force: true });
	console.log("perf build type removed");
} else {
	console.error("usage: node scripts/android-perf/perf-build.mjs setup | teardown");
	process.exit(1);
}
