import fs from "fs";

// Firebase config for Android push (FCM). Not committed by default: either keep google-services.json in the
// project root, or give EAS the file as a secret (GOOGLE_SERVICES_JSON). Without either, the app still
// builds; it just cannot receive push notifications. See docs/push-notifications.md.
const googleServicesFile =
  process.env.GOOGLE_SERVICES_JSON || (fs.existsSync("./google-services.json") ? "./google-services.json" : undefined);

// Dev server for the phone only (launch config "phone"): without the web platform, "/" answers with the dev-client
// manifest right away instead of rendering the web app on the server for every request (a readiness probe polling
// "/" then flooded Metro with renders until Windows ran out of file handles, EMFILE).
const nativeOnly = process.env.EXPO_NATIVE_ONLY === "1";

export default ({ config }) => ({
  ...config,
  ...(nativeOnly ? { platforms: ["android", "ios"] } : {}),
  android: {
    ...config.android,
    ...(googleServicesFile ? { googleServicesFile } : {})
  },
  experiments: {
    ...config.experiments,
    baseUrl: undefined
  },
  plugins: [
    ...(config.plugins || []),
    "expo-asset",
    "@react-native-google-signin/google-signin"
  ]
});
