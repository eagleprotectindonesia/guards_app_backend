import notifee, { AndroidImportance, EventType } from '@notifee/react-native';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';
import { storage } from './storage';

const CHAT_NOTIFICATION_CHANNEL_ID = 'default';
const PENDING_CHAT_NOTIFICATION_KEY = '@pending_chat_notification_open';

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

function getChatNotificationContent(data: ChatNotificationData) {
  const senderName = typeof data.senderName === 'string' && data.senderName.trim() ? data.senderName : 'Eagle Protect';
  const messagePreview = typeof data.messagePreview === 'string' ? data.messagePreview.trim() : '';

  return {
    title: `Message from ${senderName}`,
    body: messagePreview || 'You have a new message',
  };
}

let channelPromise: Promise<string> | null = null;

export function ensureChatNotificationChannel() {
  if (!channelPromise) {
    channelPromise = notifee.createChannel({
      id: CHAT_NOTIFICATION_CHANNEL_ID,
      name: 'Messages',
      importance: AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  return channelPromise;
}

export async function displayChatNotification(data: ChatNotificationData) {
  if (!isChatNotification(data)) {
    return;
  }

  const { title, body } = getChatNotificationContent(data);
  const channelId = await ensureChatNotificationChannel();

  await notifee.displayNotification({
    title,
    body,
    data: {
      type: 'chat',
      messageId: data.messageId ?? '',
    },
    android: {
      channelId,
      pressAction: {
        id: 'default',
      },
    },
  });
}

async function persistPendingChatOpen(data: ChatNotificationData) {
  if (!isChatNotification(data)) {
    return;
  }

  await storage.setItem(PENDING_CHAT_NOTIFICATION_KEY, {
    type: 'chat',
    messageId: data.messageId ?? null,
  });
}

export async function consumePendingChatOpen() {
  const pending = await storage.getItem(PENDING_CHAT_NOTIFICATION_KEY);

  if (!pending || pending.type !== 'chat') {
    return null;
  }

  await storage.removeItem(PENDING_CHAT_NOTIFICATION_KEY);
  return pending;
}

notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type !== EventType.PRESS) {
    return;
  }

  await persistPendingChatOpen(getChatNotificationData(detail.notification?.data));
});

setBackgroundMessageHandler(getMessaging(), async remoteMessage => {
  await displayChatNotification(getChatNotificationData(remoteMessage.data));
});

void ensureChatNotificationChannel();
