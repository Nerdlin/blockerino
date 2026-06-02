module.exports = function(api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxRuntime: 'automatic', unstable_transformImportMeta: true }]
    ],
    plugins: [
      ['@babel/plugin-transform-class-properties', { loose: true }],
      ['@babel/plugin-transform-private-methods', { loose: true }],
      ['@babel/plugin-transform-private-property-in-object', { loose: true }],
      'babel-plugin-transform-import-meta',
      ['babel-plugin-react-compiler', { ReactCompiler: true }]
    ]
  };
};
