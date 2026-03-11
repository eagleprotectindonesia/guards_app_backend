const Module = require('module');
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Find the project and workspace root
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

// NativeWind loads from the workspace root in this monorepo, so expose the app's
// node_modules to plain Node resolution before requiring its Metro integration.
process.env.NODE_PATH = [path.resolve(projectRoot, 'node_modules'), process.env.NODE_PATH]
  .filter(Boolean)
  .join(path.delimiter);
Module._initPaths();

const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(projectRoot);

// Watch the monorepo so workspace packages resolve correctly in Expo.
config.watchFolders = [workspaceRoot];

// Resolve packages from both the app and workspace root to avoid duplicate installs.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Exclude unrelated heavy directories from Metro's watcher.
config.resolver.blockList = [
  /.*\.git\/.*/,
  /.*\/apps\/web\/*/,
  /.*\/apps\/worker\/*/,
  /.*\/node_modules\/.*\/dist-types\/.*/,
  /.*\/node_modules\/.*\/__tests__\/.*/,
];

// Pin shared dependencies to the workspace root to prevent duplicate React instances.
config.resolver.extraNodeModules = {
  react: path.resolve(workspaceRoot, 'node_modules/react'),
  'react-dom': path.resolve(workspaceRoot, 'node_modules/react-dom'),
  'react-native': path.resolve(workspaceRoot, 'node_modules/react-native'),
  '@tanstack/react-query': path.resolve(workspaceRoot, 'node_modules/@tanstack/react-query'),
};

// Preserve SVG imports through the custom transformer.
const { transformer, resolver } = config;

config.transformer = {
  ...transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer'),
};

config.resolver = {
  ...resolver,
  assetExts: resolver.assetExts.filter(ext => ext !== 'svg'),
  sourceExts: [...resolver.sourceExts, 'svg'],
};

module.exports = withNativeWind(config, {
  input: path.resolve(projectRoot, 'global.css'),
  configPath: path.resolve(projectRoot, 'tailwind.config.js'),
  typescriptEnvPath: path.resolve(projectRoot, 'nativewind-env.d.ts'),
});
