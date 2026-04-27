import { useEffect, useRef } from 'react';
import { getInitialNotification, getMessaging, onMessage, onNotificationOpenedApp } from '@react-native-firebase/messaging';
import notifee from '@notifee/react-native';
import { Linking, Platform } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useAlert } from '../contexts/AlertContext';
import { registerFcmToken, requestUserPermission, setupTokenRefreshListener } from '../lib/fcm';
import { useCustomToast } from './useCustomToast';
import { usePathname, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  clearDisplayedChatNotifications,
  ensureChatNotificationChannel,
} from '../utils/chatNotifications';

export function usePushNotifications() {
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { showToast } = useCustomToast();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const isChatRoute = pathname.endsWith('/chat');
  const permissionLoggedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      permissionLoggedForUserRef.current = null;
    }
  }, [user?.id]);

  useEffect(() => {
    let unsubscribeRefresh: (() => void) | undefined;

    const setupPushNotifications = async () => {
      if (!user?.id) return;

      const permissionState = await requestUserPermission({ logResult: false });
      const { enabled, denied, blocked } = permissionState;

      if (permissionLoggedForUserRef.current !== user.id) {
        permissionLoggedForUserRef.current = user.id;
      }

      if (denied || blocked) {
        console.log('[Push] Notifications require settings intervention', {
          denied,
          blocked,
        });
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
                  void notifee.openNotificationSettings().catch(() => {
                    Linking.openSettings();
                  });
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
      const token = await registerFcmToken(permissionState);
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

    void getInitialNotification(messaging).then(initialNotification => {
      if (initialNotification?.data?.type === 'chat' && !isChatRoute) {
        router.push('/(tabs)/chat');
      }
    });

    const unsubscribeForeground = onMessage(messaging, async remoteMessage => {
      console.log('[Push] Foreground FCM message received', remoteMessage);
      const data = remoteMessage.data ?? {};


      const senderName = typeof data.senderName === 'string' && data.senderName.trim() ? data.senderName : 'Eagle Protect';
      const messagePreview = typeof data.messagePreview === 'string' ? data.messagePreview.trim() : '';

      showToast({
        title: `Message from ${senderName}`,
        description: messagePreview || 'You have a new message',
        status: 'info',
      });
    });

    const unsubscribeNotificationOpened = onNotificationOpenedApp(messaging, remoteMessage => {
      console.log('[Push] Firebase notification opened from background', remoteMessage);
      if (remoteMessage.data?.type === 'chat' && !isChatRoute) {
        router.push('/(tabs)/chat');
      }
    });

    void notifee.getInitialNotification().then(initialNotification => {
      console.log('[Push] Initial Notifee notification', initialNotification);
    });

    const unsubscribeForegroundEvents = notifee.onForegroundEvent(({ type, detail }) => {
      console.log('[Push] Notifee foreground event', {
        type,
        notificationData: detail.notification?.data,
      });
    });

    return () => {
      unsubscribeForeground();
      unsubscribeNotificationOpened();
      unsubscribeForegroundEvents();
    };
  }, [isChatRoute, router, showToast]);

  useEffect(() => {
    if (!isChatRoute) {
      return;
    }

    void clearDisplayedChatNotifications();
  }, [isChatRoute]);
}
