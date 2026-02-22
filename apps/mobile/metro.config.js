const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

// Find the project and workspace root
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [workspaceRoot];

// 2. Let Metro know where to resolve packages and ensure deduplication
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Exclude large, unnecessary directories from the watcher
config.resolver.blockList = [
  /.*\.git\/.*/,
  /.*\/apps\/web\/*/,
  /.*\/apps\/worker\/*/,
  /.*\/node_modules\/.*\/dist-types\/.*/,
  /.*\/node_modules\/.*\/__tests__\/.*/,
];

// 4. Force deduplication for React and related packages
config.resolver.extraNodeModules = {
  react: path.resolve(workspaceRoot, 'node_modules/react'),
  'react-dom': path.resolve(workspaceRoot, 'node_modules/react-dom'),
  'react-native': path.resolve(workspaceRoot, 'node_modules/react-native'),
  '@tanstack/react-query': path.resolve(workspaceRoot, 'node_modules/@tanstack/react-query'),
};

// 5. Configure SVG Transformer
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

module.exports = withNativeWind(config, { input: './global.css' });
