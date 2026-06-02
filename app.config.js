export default ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    baseUrl: process.env.GH_PAGES === "1" ? "/blockerino" : undefined
  }
});
