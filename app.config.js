export default ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    baseUrl: process.env.GH_PAGES === "1" ? "/blockerino" : undefined
  },
  plugins: [
    ...(config.plugins || []),
    "expo-asset",
    "@react-native-google-signin/google-signin"
  ]
});
