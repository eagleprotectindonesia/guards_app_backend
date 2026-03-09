import notifee, { AndroidImportance } from '@notifee/react-native';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';

export const CHAT_NOTIFICATION_CHANNEL_ID = 'chat_messages_v2';

type ChatNotificationData = {
  messageId?: string;
  messagePreview?: string;
  senderName?: string;
  type?: string;
};

function getChatNotificationData(data: unknown): ChatNotificationData {
  if (!data || typeof data !== 'object') {
    return {};
  }

  return data as ChatNotificationData;
}

function isChatNotification(data: ChatNotificationData) {
  return data.type === 'chat';
}

let channelPromise: Promise<string> | null = null;

export function ensureChatNotificationChannel() {
  if (!channelPromise) {
    console.log('[Push] Creating Android notification channel', { channelId: CHAT_NOTIFICATION_CHANNEL_ID });
    channelPromise = notifee.createChannel({
      id: CHAT_NOTIFICATION_CHANNEL_ID,
      name: 'Messages',
      importance: AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  return channelPromise;
}

export async function clearDisplayedChatNotifications() {
  try {
    await notifee.cancelAllNotifications();
    await notifee.setBadgeCount(0);

    console.log('[Push] Cleared app notifications and badge for chat open');
  } catch (error) {
    console.error('[Push] Failed to clear app notifications for chat open', error);
  }
}

setBackgroundMessageHandler(getMessaging(), async remoteMessage => {
  console.log('[Push] Background FCM message received', remoteMessage);
  const data = getChatNotificationData(remoteMessage.data);
  if (isChatNotification(data)) {
    console.log('[Push] Background chat push will be rendered by the OS notification payload', data);
  }
});

void ensureChatNotificationChannel();
