// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Two wallet dependencies ship package exports that break under React Native (per Privy's setup guide):
// - isows (used by viem): resolve without package exports
// - jose (used by Privy): resolve the browser build
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'isows') {
    return context.resolveRequest({ ...context, unstable_enablePackageExports: false }, moduleName, platform);
  }
  if (moduleName === 'jose') {
    return context.resolveRequest({ ...context, unstable_conditionNames: ['browser'] }, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
