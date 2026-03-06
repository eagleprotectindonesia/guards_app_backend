import { useEffect } from 'react';
import { getMessaging, onMessage } from '@react-native-firebase/messaging';
import notifee, { EventType } from '@notifee/react-native';
import { Linking, Platform } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useAlert } from '../contexts/AlertContext';
import { registerFcmToken, requestUserPermission, setupTokenRefreshListener } from '../lib/fcm';
import { useCustomToast } from './useCustomToast';
import { usePathname, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { consumePendingChatOpen, ensureChatNotificationChannel } from '../utils/chatNotifications';

export function usePushNotifications() {
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { showToast } = useCustomToast();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const isChatRoute = pathname.endsWith('/chat');

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

      await ensureChatNotificationChannel();
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
    const messaging = getMessaging();

    const openChatFromNotification = async () => {
      const pending = await consumePendingChatOpen();
      if (pending?.type === 'chat' && !isChatRoute) {
        router.push('/(tabs)/chat');
      }
    };

    void openChatFromNotification();
    void notifee.getInitialNotification().then(initialNotification => {
      if (initialNotification?.notification?.data?.type === 'chat' && !isChatRoute) {
        router.push('/(tabs)/chat');
      }
    });

    const unsubscribeForeground = onMessage(messaging, async remoteMessage => {
      const data = remoteMessage.data ?? {};

      if (data.type !== 'chat' || isChatRoute) {
        return;
      }

      const senderName = typeof data.senderName === 'string' && data.senderName.trim() ? data.senderName : 'Eagle Protect';
      const messagePreview = typeof data.messagePreview === 'string' ? data.messagePreview.trim() : '';

      showToast({
        title: `Message from ${senderName}`,
        description: messagePreview || 'You have a new message',
        status: 'info',
      });
    });

    const unsubscribeForegroundEvents = notifee.onForegroundEvent(async ({ type, detail }) => {
      if (type === EventType.PRESS && detail.notification?.data?.type === 'chat' && !isChatRoute) {
        await consumePendingChatOpen();
        setTimeout(() => {
          router.push('/(tabs)/chat');
        }, 500);
      }
    });

    return () => {
      unsubscribeForeground();
      unsubscribeForegroundEvents();
    };
  }, [isChatRoute, router, showToast]);
}
