module.exports = function(api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxRuntime: 'automatic', unstable_transformImportMeta: true }]
    ],
    plugins: [
      'babel-plugin-transform-import-meta'
    ]
  };
};
