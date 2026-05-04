const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Enable tree shaking & minification for production
config.transformer.minifierConfig = {
  keep_fnames: true,
  mangle: { keep_fnames: true },
};

// Faster module resolution
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
