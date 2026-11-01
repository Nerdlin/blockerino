import * as Application from "expo-application";

// The debug build installs as com.nerdlin.blockerino.dev next to the store app. It is the test profile: things that
// take hours to reach in a real game (the master chess bots) are open there from the start.
export const IS_TEST_BUILD = (Application.applicationId ?? "").endsWith(".dev");
