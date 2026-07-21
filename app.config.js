export default ({ config }) => ({
  ...config,
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
