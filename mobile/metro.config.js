const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Enable tree shaking & minification for production
config.transformer.minifierConfig = {
  keep_fnames: true,
  mangle: { keep_fnames: true },
};

// Faster module resolution
config.resolver.unstable_enablePackageExports = true;

// Allow Metro to bundle .wasm files as static assets (needed by expo-sqlite web worker)
config.resolver.assetExts = [...(config.resolver.assetExts || []), 'wasm'];

// On web, swap expo-sqlite for a no-op stub so the bundler doesn't choke
// on the native-only SQLite bindings. Offline-first POS features degrade
// gracefully on web (they're only needed on the device).
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'expo-sqlite') {
    return {
      filePath: path.resolve(__dirname, 'src/mocks/expo-sqlite.web.js'),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
