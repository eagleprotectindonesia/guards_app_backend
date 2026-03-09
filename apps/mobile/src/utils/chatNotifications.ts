import notifee, { AndroidImportance } from '@notifee/react-native';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';

const CHAT_NOTIFICATION_CHANNEL_ID = 'default';

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

setBackgroundMessageHandler(getMessaging(), async remoteMessage => {
  console.log('[Push] Background FCM message received', remoteMessage);
  const data = getChatNotificationData(remoteMessage.data);
  if (isChatNotification(data)) {
    console.log('[Push] Background chat push will be rendered by the OS notification payload', data);
  }
});

void ensureChatNotificationChannel();
