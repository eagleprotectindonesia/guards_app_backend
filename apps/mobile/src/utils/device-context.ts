import * as Sentry from '@sentry/browser';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

export function setSentryDeviceContext() {
  Sentry.setContext('device', {
    os: Platform.OS,
    osVersion: Platform.Version,
    appVersion: Constants.expoConfig?.version ?? Constants.nativeApplicationVersion,
    appBuildVersion: Constants.nativeBuildVersion,
    deviceName: Constants.deviceName,
    deviceId: Constants.deviceId,
    runtimeVersion: Constants.expoConfig?.runtimeVersion,
  });
}
