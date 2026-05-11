import { firebaseAdmin } from './firebase-admin';
import { getEmployeeFcmTokens, removeStaleFcmTokens } from '@repo/database';

const CHAT_NOTIFICATION_CHANNEL_ID = 'chat_messages_v2';
const LEAVE_NOTIFICATION_CHANNEL_ID = 'leave_updates_v1';
const WEB_APP_URL = process.env.WEB_APP_URL || 'http://localhost:3000';

export type ChatPushNotificationReason = 'firebase_unavailable' | 'no_tokens' | 'sent' | 'send_error';
export type LeavePushNotificationReason = 'firebase_unavailable' | 'no_tokens' | 'sent' | 'send_error';

export type ChatPushNotificationResult = {
  attempted: boolean;
  tokenCount: number;
  successCount: number;
  failureCount: number;
  staleTokenCount: number;
  reason: ChatPushNotificationReason;
};

export type LeavePushNotificationResult = {
  attempted: boolean;
  tokenCount: number;
  successCount: number;
  failureCount: number;
  staleTokenCount: number;
  reason: LeavePushNotificationReason;
};

const maskToken = (token: string) => (token.length <= 8 ? token : token.slice(-8));

type ChatUnreadCountProvider = (params: { employeeId: string; isAdmin: boolean }) => Promise<number>;

let getUnreadCountProvider: ChatUnreadCountProvider | null = null;

export function setChatUnreadCountProvider(provider: ChatUnreadCountProvider) {
  getUnreadCountProvider = provider;
}

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
    const tokensResult = await getEmployeeFcmTokens(employeeId);

    if (tokensResult.length === 0) {
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

    const tokenStrings = tokensResult.map(t => t.token);
    const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
    const title = `Message from ${senderName}`;
    const body = preview || 'You have a new message';
    const unreadBadgeCount = getUnreadCountProvider
      ? await getUnreadCountProvider({
          employeeId,
          isAdmin: false,
        })
      : 0;
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
            badge: unreadBadgeCount,
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
      webpush: {
        fcmOptions: {
          link: `${WEB_APP_URL}/employee/chat`,
        },
      },
      tokens: tokenStrings,
    };

    console.info('[FCM] Sending chat push notification', {
      employeeId,
      messageId,
      tokenCount: tokenStrings.length,
      androidNotification,
      unreadBadgeCount,
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
        await removeStaleFcmTokens(failedTokens);
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

export async function sendLeaveRequestStatusPushNotification(params: {
  employeeId: string;
  leaveRequestId: string;
  status: 'approved' | 'rejected';
  reason: string;
  startDate: string;
  endDate: string;
}): Promise<LeavePushNotificationResult> {
  const { employeeId, leaveRequestId, status, reason, startDate, endDate } = params;
  const title = status === 'approved' ? 'Leave request approved' : 'Leave request rejected';
  const body = `Your leave request for ${startDate} to ${endDate} was ${status}.`;

  if (!firebaseAdmin.apps.length) {
    console.warn('[FCM] Leave push skipped: Firebase Admin SDK not initialized', {
      employeeId,
      leaveRequestId,
      status,
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
    const tokensResult = await getEmployeeFcmTokens(employeeId);
    if (tokensResult.length === 0) {
      console.info('[FCM] Leave push skipped: no registered tokens', {
        employeeId,
        leaveRequestId,
        status,
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

    const tokenStrings = tokensResult.map(t => t.token);
    const androidNotification = {
      title,
      body,
      channelId: LEAVE_NOTIFICATION_CHANNEL_ID,
      sound: 'default',
    };
    const message = {
      notification: { title, body },
      android: {
        priority: 'high' as const,
        notification: androidNotification,
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: {
          aps: {
            alert: { title, body },
            sound: 'default',
            'content-available': 1,
          },
        },
      },
      data: {
        type: 'leave_request_status_changed',
        leaveRequestId: String(leaveRequestId),
        status,
        reason: String(reason),
        startDate,
        endDate,
        targetPath: '/leave-requests',
      },
      webpush: {
        fcmOptions: {
          link: `${WEB_APP_URL}/employee/leave-requests`,
        },
      },
      tokens: tokenStrings,
    };

    const response = await firebaseAdmin.messaging().sendEachForMulticast(message);
    let staleTokenCount = 0;
    if (response.failureCount > 0) {
      const failedTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          console.warn('[FCM] Leave push token delivery failed', {
            employeeId,
            leaveRequestId,
            status,
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
        await removeStaleFcmTokens(failedTokens);
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
    console.error(`[FCM] Error sending leave push notification to employee ${employeeId}:`, error);
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
