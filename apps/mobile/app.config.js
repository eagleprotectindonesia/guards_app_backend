const appJson = require('./app.json');

const profile = process.env.APP_VARIANT || process.env.EAS_BUILD_PROFILE || 'production';

const variants = {
  development: {
    appName: 'EP Employee Dev',
    bundleSuffix: '.dev',
    androidGoogleServicesFile: './google-services.dev.json',
  },
  preview: {
    appName: 'EP Employee Preview',
    bundleSuffix: '.preview',
    androidGoogleServicesFile: './google-services.preview.json',
  },
  production: {
    appName: 'EP Employee',
    bundleSuffix: '',
    androidGoogleServicesFile: './google-services.json',
  },
};

const selected = variants[profile] || variants.production;

const config = {
  ...appJson.expo,
  name: selected.appName,
  ios: {
    ...appJson.expo.ios,
    bundleIdentifier: `${appJson.expo.ios.bundleIdentifier}${selected.bundleSuffix}`,
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
