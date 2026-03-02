import messaging from '@react-native-firebase/messaging';
import { Platform } from 'react-native';
import { client } from '../api/client';

/**
 * Request permission for push notifications (Android 13+ / iOS).
 * Returns whether permission is enabled and whether it was explicitly denied.
 */
export async function requestUserPermission(): Promise<{ enabled: boolean; denied: boolean }> {
  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED || authStatus === messaging.AuthorizationStatus.PROVISIONAL;
  const denied = authStatus === messaging.AuthorizationStatus.DENIED;

  return { enabled, denied };
}

/**
 * Get the FCM token for the device and send it to the backend.
 */
export async function registerFcmToken() {
  try {
    const { enabled } = await requestUserPermission();
    if (!enabled) {
      console.warn('[FCM] Push notification permission denied');
      return null;
    }

    const token = await messaging().getToken();
    const deviceInfo = `${Platform.OS} ${Platform.Version}`;

    await client.post('/api/employee/fcm-token', {
      token,
      deviceInfo,
    });

    return token;
  } catch (error) {
    console.error('[FCM] Error registering FCM token:', error);
    return null;
  }
}

/**
 * Listen for token refreshes and re-register with the backend.
 */
export function setupTokenRefreshListener() {
  return messaging().onTokenRefresh(async newToken => {
    try {
      const deviceInfo = `${Platform.OS} ${Platform.Version}`;
      await client.post('/api/employee/fcm-token', {
        token: newToken,
        deviceInfo,
      });
    } catch (error) {
      console.error('[FCM] Error refreshing FCM token:', error);
    }
  });
}
