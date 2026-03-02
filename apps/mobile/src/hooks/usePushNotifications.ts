import { useEffect } from 'react';
import messaging from '@react-native-firebase/messaging';
import { Linking, Platform } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useAlert } from '../contexts/AlertContext';
import { registerFcmToken, requestUserPermission, setupTokenRefreshListener } from '../lib/fcm';
import { useCustomToast } from './useCustomToast';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

export function usePushNotifications() {
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { showToast } = useCustomToast();
  const router = useRouter();
  const { t } = useTranslation();

  useEffect(() => {
    let unsubscribeRefresh: (() => void) | undefined;

    const setupPushNotifications = async () => {
      if (!user?.id) return;

      // Check permission first before trying to get a token
      const { enabled, denied } = await requestUserPermission();

      if (denied) {
        // Android 13+ and iOS: the OS will not show the dialog again after denial.
        // Guide the user to app settings manually.
        showAlert(
          t('notifications.permission_title'),
          t('notifications.permission_message'),
          [
            {
              text: t('notifications.permission_later'),
              style: 'cancel',
            },
            {
              text: t('notifications.permission_settings'),
              onPress: () => {
                if (Platform.OS === 'android') {
                  Linking.openSettings();
                } else {
                  Linking.openURL('app-settings:');
                }
              },
            },
          ],
          { icon: 'warning' }
        );
        return;
      }

      if (!enabled) return;

      const token = await registerFcmToken();
      if (token) {
        unsubscribeRefresh = setupTokenRefreshListener();
      }
    };

    setupPushNotifications();

    return () => {
      if (unsubscribeRefresh) {
        unsubscribeRefresh();
      }
    };
  }, [user?.id, t, showAlert]);

  useEffect(() => {
    // Handle foreground messages with an in-app toast
    const unsubscribeForeground = messaging().onMessage(async remoteMessage => {
      if (remoteMessage.notification) {
        showToast({
          title: remoteMessage.notification.title || 'New Message',
          description: remoteMessage.notification.body || '',
          status: 'info',
        });
      }
    });

    // Handle notification tap while app is in the background
    const unsubscribeNotificationOpenedApp = messaging().onNotificationOpenedApp(remoteMessage => {
      if (remoteMessage.data?.type === 'chat') {
        router.push('/(tabs)/chat');
      }
    });

    // Handle notification tap while app was killed/quit
    messaging()
      .getInitialNotification()
      .then(remoteMessage => {
        if (remoteMessage?.data?.type === 'chat') {
          setTimeout(() => {
            router.push('/(tabs)/chat');
          }, 500);
        }
      });

    return () => {
      unsubscribeForeground();
      unsubscribeNotificationOpenedApp();
    };
  }, [router, showToast]);
}
