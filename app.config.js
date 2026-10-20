import fs from "fs";

// Firebase config for Android push (FCM). Not committed by default: either keep google-services.json in the
// project root, or give EAS the file as a secret (GOOGLE_SERVICES_JSON). Without either, the app still
// builds; it just cannot receive push notifications. See docs/push-notifications.md.
const googleServicesFile =
  process.env.GOOGLE_SERVICES_JSON || (fs.existsSync("./google-services.json") ? "./google-services.json" : undefined);

export default ({ config }) => ({
  ...config,
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
