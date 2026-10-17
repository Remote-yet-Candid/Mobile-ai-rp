/* global require, module, __dirname */
// Metro loads this native-build configuration as CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// NodeNext emits explicit .js specifiers. Native package exports point to TS sources.
// Preserve normal JS/platform resolution first, then resolve that same relative TS module.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  try {
    return context.resolveRequest(context, moduleName, platform);
  } catch (originalError) {
    if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
      try {
        return context.resolveRequest(context, moduleName.slice(0, -3), platform);
      } catch {
        // Keep the original diagnostic if neither a real JS nor a source TS module exists.
      }
    }
    throw originalError;
  }
};
module.exports = config;
