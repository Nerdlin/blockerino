# Android frame-time check

Measures how smooth the game is on a real phone: opening a game, dragging a piece, clearing a line (with a combo), and a fast
circular drag. Same seeded save, same touches, so two builds can be compared. Written on 2026-11-19 on a Galaxy (1440x3120, 60 Hz).

Why not the dev client: it always runs a dev-mode bundle, so its frame times mean nothing. The emulator's software GPU is no
better. These scripts need a release-mode build with its own package name that does not touch the Play app's data.

`node scripts/android-perf/perf-build.mjs setup` does steps 1-3 below for you and `teardown` undoes them.

## One-time setup (temporary, do not commit)

1. `android/app/build.gradle`, inside `buildTypes`:
   ```
   perf {
       initWith release
       signingConfig signingConfigs.debug
       applicationIdSuffix ".perf"
       matchingFallbacks = ["release"]
   }
   ```
   Do **not** add `debuggable true` here: it switches CMake to a debug native build and the build fails.
2. `android/app/src/perf/AndroidManifest.xml`:
   ```xml
   <manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">
     <application android:debuggable="true" tools:replace="android:debuggable">
       <meta-data android:name="expo.modules.updates.ENABLED" android:value="false" tools:replace="android:value"/>
     </application>
   </manifest>
   ```
   (`debuggable` only so `run-as` can seed the saved game; OTA off so production updates cannot replace the code.)
3. `android/app/src/perf/google-services.json`: a copy of `android/app/google-services.json` with `package_name`
   changed to `com.nerdlin.blockerino.perf`.
4. Build and install: `cd android && ./gradlew assemblePerf -x lint -x lintVitalPerf -x lintVitalAnalyzePerf -x lintVitalReportPerf`,
   then `adb install -r app/build/outputs/apk/perf/app-perf.apk`. Uninstall it and revert the three files when done.

## Run

```
set ANDROID_SERIAL=<adb devices>            # the phone
python scripts/android-perf/run_line.py A 3       # entry, drag and line clear, 3 trials, label A
python scripts/android-perf/run_gesture.py A classic   # 360 fast circular drags; also: chaos
```

To compare two builds, install one, run with label A, install the other, run with label B.

`phone.py` seeds `ACTIVE_GAME` (a nearly full row, score 100, combo 3, the Terminal skin) into the app's storage through
`run-as` and reads it back to confirm the move counted (score 117, combo 4, empty board). The tap and swipe coordinates are for
a 1440x3120 screen; for another phone change them at the top of the run scripts.

## What the numbers mean

`gfxinfo` keeps only the last 120 frames. A game that renders continuously overwrites them in about two seconds, so a single dump
after the scenario drops the interesting frames. `Collector` in `phone.py` polls every 250 ms and merges frames by `IntendedVsync`.

- `overrun_ms`: the sum of how far each frame ran past 16.7 ms. Lower is better and it is stable between runs.
- `over33`, `over50`: frames longer than 33 and 50 ms. These are the visible hitches.
- `p95`, `p99`, `max`: frame time percentiles in ms.

Compare `overrun_ms` and `over50` of the same scenario, not between scenarios. Run at least 3 trials; the first frame after a fresh
install is slower.

`FrameMarkQA.java` and `GestureQA.java` are the sources of the two jars (they run on the phone through `app_process`): the first
injects a tap or swipe and prints monotonic timestamps, the second injects the fast circular drag.
