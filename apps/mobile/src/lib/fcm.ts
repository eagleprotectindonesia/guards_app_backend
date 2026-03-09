import {
  getMessaging,
  getToken,
  requestPermission,
  onTokenRefresh,
  AuthorizationStatus,
} from '@react-native-firebase/messaging';
import notifee from '@notifee/react-native';
import { Platform } from 'react-native';
import { client } from '../api/client';

export type NotificationPermissionState = {
  enabled: boolean;
  denied: boolean;
  blocked: boolean;
};

/**
 * Request permission for push notifications (Android 13+ / iOS).
 * Returns whether permission is enabled, whether it was explicitly denied,
 * and whether notifications are blocked at the OS/app-settings level.
 */
export async function requestUserPermission({
  logResult = true,
}: {
  logResult?: boolean;
} = {}): Promise<NotificationPermissionState> {
  const messaging = getMessaging();
  const authStatus = await requestPermission(messaging);
  const denied = authStatus === AuthorizationStatus.DENIED;
  const notificationSettings = await notifee.getNotificationSettings();
  const blocked = notificationSettings.authorizationStatus !== 1;
  const enabled =
    (authStatus === AuthorizationStatus.AUTHORIZED || authStatus === AuthorizationStatus.PROVISIONAL) && !blocked;

  if (logResult) {
    console.log('[Push] Notification permission result', {
      authStatus,
      enabled,
      denied,
      blocked,
      notificationSettings,
    });
  }

  return { enabled, denied, blocked };
}

/**
 * Get the FCM token for the device and send it to the backend.
 */
export async function registerFcmToken(permissionState?: NotificationPermissionState) {
  try {
    const { enabled, blocked } = permissionState ?? (await requestUserPermission({ logResult: false }));
    if (!enabled) {
      console.warn('[FCM] Push notification permission unavailable', {
        blocked,
        tokenRegisteredWithBackend: false,
      });
      return null;
    }

    const messaging = getMessaging();
    const token = await getToken(messaging);
    const deviceInfo = `${Platform.OS} ${Platform.Version}`;
    console.log('[Push] Registering FCM token', {
      token,
      deviceInfo,
    });

    await client.post('/api/employee/fcm-token', {
      token,
      deviceInfo,
    });
    console.log('[Push] FCM token registration complete', {
      tokenRegisteredWithBackend: true,
      deviceInfo,
    });

    return token;
  } catch (error) {
    console.error('[FCM] Error registering FCM token:', {
      error,
      tokenRegisteredWithBackend: false,
    });
    return null;
  }
}

/**
 * Listen for token refreshes and re-register with the backend.
 */
export function setupTokenRefreshListener() {
  const messaging = getMessaging();
  return onTokenRefresh(messaging, async newToken => {
    try {
      const deviceInfo = `${Platform.OS} ${Platform.Version}`;
      console.log('[Push] FCM token refreshed', {
        newToken,
        deviceInfo,
      });
      await client.post('/api/employee/fcm-token', {
        token: newToken,
        deviceInfo,
      });
      console.log('[Push] FCM token refresh registration complete', {
        tokenRegisteredWithBackend: true,
        deviceInfo,
      });
    } catch (error) {
      console.error('[FCM] Error refreshing FCM token:', {
        error,
        tokenRegisteredWithBackend: false,
      });
    }
  });
}
