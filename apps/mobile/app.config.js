const fs = require('fs');
const path = require('path');
const appJson = require('./app.json');

const profile = process.env.EAS_BUILD_PROFILE || process.env.APP_VARIANT || 'production';

const variants = {
  development: {
    appName: 'EP Employee Dev',
    bundleSuffix: '.dev',
    iosGoogleServicesFile: './GoogleService-Info.dev.plist',
    androidGoogleServicesFile: './google-services.dev.json',
    iosApsEnvironment: 'development',
  },
  preview: {
    appName: 'EP Employee Preview',
    bundleSuffix: '.preview',
    iosGoogleServicesFile: './GoogleService-Info.preview.plist',
    androidGoogleServicesFile: './google-services.preview.json',
    iosApsEnvironment: 'production',
  },
  production: {
    appName: 'EP Employee',
    bundleSuffix: '',
    iosGoogleServicesFile: './GoogleService-Info.plist',
    androidGoogleServicesFile: './google-services.json',
    iosApsEnvironment: 'production',
  },
};

const selected = variants[profile] || variants.production;
const configDir = path.dirname(require.resolve('./app.json'));
const resolvedIosGoogleServicesFile = selected.iosGoogleServicesFile
  ? path.join(configDir, selected.iosGoogleServicesFile)
  : null;
const resolvedAndroidGoogleServicesFile = selected.androidGoogleServicesFile
  ? path.join(configDir, selected.androidGoogleServicesFile)
  : null;

if (resolvedIosGoogleServicesFile && !fs.existsSync(resolvedIosGoogleServicesFile)) {
  throw new Error(`Missing iOS Firebase config for "${profile}": ${selected.iosGoogleServicesFile}`);
}

if (resolvedAndroidGoogleServicesFile && !fs.existsSync(resolvedAndroidGoogleServicesFile)) {
  throw new Error(`Missing Android Firebase config for "${profile}": ${selected.androidGoogleServicesFile}`);
}

const config = {
  ...appJson.expo,
  name: selected.appName,
  ios: {
    ...appJson.expo.ios,
    bundleIdentifier: `${appJson.expo.ios.bundleIdentifier}${selected.bundleSuffix}`,
    googleServicesFile: selected.iosGoogleServicesFile,
    entitlements: {
      ...(appJson.expo.ios.entitlements || {}),
      'aps-environment': selected.iosApsEnvironment,
    },
  },
  android: {
    ...appJson.expo.android,
    package: `${appJson.expo.android.package}${selected.bundleSuffix}`,
    googleServicesFile: selected.androidGoogleServicesFile,
  },
};

module.exports = {
  expo: config,
};
