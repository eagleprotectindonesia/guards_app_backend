import { firebaseAdmin } from './firebase-admin';
import { db as prisma } from '@/lib/prisma';

const CHAT_NOTIFICATION_CHANNEL_ID = 'chat_messages_v2';

export type ChatPushNotificationReason = 'firebase_unavailable' | 'no_tokens' | 'sent' | 'send_error';

export type ChatPushNotificationResult = {
  attempted: boolean;
  tokenCount: number;
  successCount: number;
  failureCount: number;
  staleTokenCount: number;
  reason: ChatPushNotificationReason;
};

const maskToken = (token: string) => (token.length <= 8 ? token : token.slice(-8));

export async function sendChatPushNotification(params: {
  employeeId: string;
  senderName: string;
  content: string;
  messageId: string;
}): Promise<ChatPushNotificationResult> {
  const { employeeId, senderName, content, messageId } = params;

  if (!firebaseAdmin.apps.length) {
    console.warn('[FCM] Chat push skipped: Firebase Admin SDK not initialized', {
      employeeId,
      messageId,
    });
    return {
      attempted: false,
      tokenCount: 0,
      successCount: 0,
      failureCount: 0,
      staleTokenCount: 0,
      reason: 'firebase_unavailable',
    };
  }

  try {
    const tokens = await prisma.fcmToken.findMany({
      where: {
        employeeSession: {
          employeeId,
          revokedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
      },
      select: { token: true },
    });

    if (tokens.length === 0) {
      console.info('[FCM] Chat push skipped: no registered tokens', {
        employeeId,
        messageId,
      });
      return {
        attempted: false,
        tokenCount: 0,
        successCount: 0,
        failureCount: 0,
        staleTokenCount: 0,
        reason: 'no_tokens',
      };
    }

    const tokenStrings = tokens.map(t => t.token);
    const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
    const title = `Message from ${senderName}`;
    const body = preview || 'You have a new message';
    const androidNotification = {
      title,
      body,
      channelId: CHAT_NOTIFICATION_CHANNEL_ID,
      sound: 'default',
    };
    const message = {
      notification: {
        title,
        body,
      },
      android: {
        priority: 'high' as const,
        notification: androidNotification,
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: {
          aps: {
            alert: {
              title,
              body,
            },
            sound: 'default',
            'content-available': 1,
          },
        },
      },
      data: {
        type: 'chat',
        messageId: String(messageId),
        // Passed to the app's background handler for localised notification display.
        senderName,
        messagePreview: preview || '',
      },
      tokens: tokenStrings,
    };

    console.info('[FCM] Sending chat push notification', {
      employeeId,
      messageId,
      tokenCount: tokenStrings.length,
      androidNotification,
    });

    const response = await firebaseAdmin.messaging().sendEachForMulticast(message);
    console.info('[FCM] Chat push send result', {
      employeeId,
      messageId,
      tokenCount: tokenStrings.length,
      successCount: response.successCount,
      failureCount: response.failureCount,
    });

    let staleTokenCount = 0;
    if (response.failureCount > 0) {
      const failedTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          console.warn('[FCM] Chat push token delivery failed', {
            employeeId,
            messageId,
            tokenSuffix: maskToken(tokenStrings[idx]),
            errorCode,
          });
          if (
            errorCode === 'messaging/invalid-registration-token' ||
            errorCode === 'messaging/registration-token-not-registered'
          ) {
            failedTokens.push(tokenStrings[idx]);
          }
        }
      });

      if (failedTokens.length > 0) {
        staleTokenCount = failedTokens.length;
        await prisma.fcmToken.deleteMany({
          where: { token: { in: failedTokens } },
        });
        console.warn('[FCM] Removed stale FCM tokens after failed chat push', {
          employeeId,
          messageId,
          staleTokenCount,
          tokenSuffixes: failedTokens.map(maskToken),
        });
      }
    }

    return {
      attempted: true,
      tokenCount: tokenStrings.length,
      successCount: response.successCount,
      failureCount: response.failureCount,
      staleTokenCount,
      reason: 'sent',
    };
  } catch (error) {
    console.error(`[FCM] Error sending push notification to employee ${employeeId}:`, error);
    return {
      attempted: true,
      tokenCount: 0,
      successCount: 0,
      failureCount: 0,
      staleTokenCount: 0,
      reason: 'send_error',
    };
  }
}
