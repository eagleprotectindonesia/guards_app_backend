import { firebaseAdmin } from './firebase-admin';
import { db as prisma } from '@/lib/prisma';

export async function sendChatPushNotification(params: {
  employeeId: string;
  senderName: string;
  content: string;
  messageId: string;
}) {
  const { employeeId, senderName, content, messageId } = params;

  if (!firebaseAdmin.apps.length) {
    console.warn('[FCM] Cannot send push notification: Firebase Admin SDK not initialized');
    return;
  }

  try {
    // 1. Fetch all FCM tokens for the given employee
    const tokens = await prisma.fcmToken.findMany({
      where: { employeeId },
      select: { token: true },
    });

    if (tokens.length === 0) {
      return; // No devices registered for this employee
    }

    const tokenStrings = tokens.map(t => t.token);

    // 2. Build the message payload (hybrid: OS renders in background/killed, app uses data for routing)
    const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
    const title = `Message from ${senderName}`;
    const body = preview || 'You have a new message';
    const message = {
      android: {
        priority: 'high' as const,
        notification: {
          title,
          body,
          channelId: 'default',
        },
      },
      apns: {
        // Include visible alert content so iOS can present the push when the app is backgrounded or killed.
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

    // 3. Send multicast message
    const response = await firebaseAdmin.messaging().sendEachForMulticast(message);

    // 4. Clean up stale/invalid tokens
    if (response.failureCount > 0) {
      const failedTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          if (
            errorCode === 'messaging/invalid-registration-token' ||
            errorCode === 'messaging/registration-token-not-registered'
          ) {
            failedTokens.push(tokenStrings[idx]);
          } else {
            console.warn(`[FCM] Failed to deliver to token. Error: ${errorCode}`);
          }
        }
      });

      if (failedTokens.length > 0) {
        await prisma.fcmToken.deleteMany({
          where: { token: { in: failedTokens } },
        });
      }
    }
  } catch (error) {
    console.error(`[FCM] Error sending push notification to employee ${employeeId}:`, error);
  }
}
