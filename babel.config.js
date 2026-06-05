module.exports = function(api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxRuntime: 'automatic', unstable_transformImportMeta: true }]
    ],
    plugins: [
      '@babel/plugin-transform-class-properties',
      '@babel/plugin-transform-private-methods',
      '@babel/plugin-transform-private-property-in-object',
      'babel-plugin-transform-import-meta',
      ['babel-plugin-react-compiler', { ReactCompiler: true }]
    ]
  };
};
