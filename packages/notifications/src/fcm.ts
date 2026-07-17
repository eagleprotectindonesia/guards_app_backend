import { firebaseAdmin } from './firebase-admin';
import { getEmployeeFcmTokens, removeStaleFcmTokens } from '@repo/database';

export type CalendarEventTagNotificationReason = 'firebase_unavailable' | 'no_tokens' | 'sent' | 'send_error';

export type CalendarEventTagPushNotificationResult = {
  attempted: boolean;
  tokenCount: number;
  successCount: number;
  failureCount: number;
  staleTokenCount: number;
  reason: CalendarEventTagNotificationReason;
};

const CHAT_NOTIFICATION_CHANNEL_ID = 'chat_messages_v2';
const GROUP_CHAT_NOTIFICATION_CHANNEL_ID = 'group_chat_messages_v1';
const LEAVE_NOTIFICATION_CHANNEL_ID = 'leave_updates_v1';
const CALENDAR_NOTIFICATION_CHANNEL_ID = 'calendar_events_v1';
const WEB_APP_URL = process.env.WEB_APP_URL || 'http://localhost:3000';

export type ChatPushNotificationReason = 'firebase_unavailable' | 'no_tokens' | 'sent' | 'send_error';
export type LeavePushNotificationReason = 'firebase_unavailable' | 'no_tokens' | 'sent' | 'send_error';
export type GroupChatPushNotificationReason = 'firebase_unavailable' | 'no_tokens' | 'sent' | 'send_error';

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

export type GroupChatPushNotificationResult = {
  attempted: boolean;
  tokenCount: number;
  successCount: number;
  failureCount: number;
  staleTokenCount: number;
  reason: GroupChatPushNotificationReason;
};

const maskToken = (token: string) => (token.length <= 8 ? token : token.slice(-8));

// eslint-disable-next-line no-unused-vars
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

export async function sendGroupChatPushNotification(params: {
  employeeId: string;
  groupId: string;
  groupTitle: string;
  senderName: string;
  content: string;
  messageId: string;
}): Promise<GroupChatPushNotificationResult> {
  const { employeeId, groupId, groupTitle, senderName, content, messageId } = params;

  if (!firebaseAdmin.apps.length) {
    console.warn('[FCM] Group chat push skipped: Firebase Admin SDK not initialized', {
      employeeId,
      groupId,
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
      console.info('[FCM] Group chat push skipped: no registered tokens', {
        employeeId,
        groupId,
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
    const title = groupTitle;
    const body = preview ? `${senderName}: ${preview}` : `${senderName} sent a message`;
    const androidNotification = {
      title,
      body,
      channelId: GROUP_CHAT_NOTIFICATION_CHANNEL_ID,
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
        type: 'group_chat_message',
        groupId: String(groupId),
        messageId: String(messageId),
        senderName,
        messagePreview: preview || '',
        targetPath: '/chat',
      },
      webpush: {
        fcmOptions: {
          link: `${WEB_APP_URL}/employee/chat`,
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
    console.error(`[FCM] Error sending group chat push notification to employee ${employeeId}:`, error);
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

export type TicketPushNotificationReason = 'firebase_unavailable' | 'no_tokens' | 'sent' | 'send_error';

export type TicketPushNotificationResult = {
  attempted: boolean;
  tokenCount: number;
  successCount: number;
  failureCount: number;
  staleTokenCount: number;
  reason: TicketPushNotificationReason;
};

const TICKET_NOTIFICATION_CHANNEL_ID = 'ticket_updates_v1';
const SHIFT_NOTIFICATION_CHANNEL_ID = 'shift_updates_v1';

export type ShiftReassignmentPushNotificationReason =
  | 'firebase_unavailable'
  | 'no_tokens'
  | 'sent'
  | 'send_error';

export type ShiftReassignmentPushNotificationResult = {
  attempted: boolean;
  tokenCount: number;
  successCount: number;
  failureCount: number;
  staleTokenCount: number;
  reason: ShiftReassignmentPushNotificationReason;
};

export async function sendShiftReassignmentPushNotification(params: {
  employeeId: string;
  shiftId: string;
  siteName: string;
  shiftTypeName: string;
  date: Date;
  startsAt: Date;
  endsAt: Date;
  reason: string;
  kind: 'swap' | 'replace';
  wasOriginalAssignee: boolean;
}): Promise<ShiftReassignmentPushNotificationResult> {
  const { employeeId, shiftId, siteName, shiftTypeName, date, reason, kind, wasOriginalAssignee } =
    params;

  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '/'); // YYYY/MM/DD
  let title: string;
  let body: string;
  if (kind === 'swap') {
    title = 'Shift ditukar';
    body = `Shift ${siteName} (${shiftTypeName}) pada ${dateStr} telah ditukar. Alasan: ${reason}`;
  } else if (wasOriginalAssignee) {
    title = 'Shift Anda diganti';
    body = `Shift ${siteName} (${shiftTypeName}) pada ${dateStr} telah diganti. Alasan: ${reason}`;
  } else {
    title = 'Shift baru ditugaskan';
    body = `Anda ditugaskan shift ${siteName} (${shiftTypeName}) pada ${dateStr}. Alasan: ${reason}`;
  }

  if (!firebaseAdmin.apps.length) {
    console.warn('[FCM] Shift reassignment push skipped: Firebase Admin SDK not initialized', {
      employeeId,
      shiftId,
      kind,
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
      console.info('[FCM] Shift reassignment push skipped: no registered tokens', {
        employeeId,
        shiftId,
        kind,
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
      channelId: SHIFT_NOTIFICATION_CHANNEL_ID,
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
        type: 'shift_reassigned',
        shiftId: String(shiftId),
        siteName,
        shiftTypeName,
        date: date.toISOString().slice(0, 10),
        kind,
        wasOriginalAssignee: String(wasOriginalAssignee),
        targetPath: '/shifts',
      },
      webpush: {
        fcmOptions: {
          link: `${WEB_APP_URL}/employee/shifts`,
        },
      },
      tokens: tokenStrings,
    };

    console.info('[FCM] Sending shift reassignment push notification', {
      employeeId,
      shiftId,
      kind,
      tokenCount: tokenStrings.length,
    });

    const response = await firebaseAdmin.messaging().sendEachForMulticast(message);
    console.info('[FCM] Shift reassignment push send result', {
      employeeId,
      shiftId,
      successCount: response.successCount,
      failureCount: response.failureCount,
    });

    let staleTokenCount = 0;
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
          }
        }
      });
      if (failedTokens.length > 0) {
        staleTokenCount = failedTokens.length;
        await removeStaleFcmTokens(failedTokens);
        console.warn('[FCM] Removed stale FCM tokens after shift reassignment push', {
          employeeId,
          shiftId,
          staleTokenCount,
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
    console.error(`[FCM] Error sending shift reassignment push to employee ${employeeId}:`, error);
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

export async function sendTicketCreatedPushNotification(params: {
  employeeId: string;
  ticketId: string;
  ticketCode: string;
  title: string;
}): Promise<TicketPushNotificationResult> {
  const { employeeId, ticketId, ticketCode, title: ticketTitle } = params;
  const title = `New Ticket assigned: ${ticketCode}`;
  const body = ticketTitle || 'A new ticket has been assigned to your department.';

  if (!firebaseAdmin.apps.length) {
    console.warn('[FCM] Ticket push skipped: Firebase Admin SDK not initialized', {
      employeeId,
      ticketId,
      ticketCode,
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
      console.info('[FCM] Ticket push skipped: no registered tokens', {
        employeeId,
        ticketId,
        ticketCode,
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
      channelId: TICKET_NOTIFICATION_CHANNEL_ID,
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
        type: 'ticket_created',
        ticketId: String(ticketId),
        ticketCode: String(ticketCode),
        ticketTitle: String(ticketTitle),
        targetPath: `/tickets?id=${ticketId}`,
      },
      webpush: {
        fcmOptions: {
          link: `${WEB_APP_URL}/employee/tickets?id=${ticketId}`,
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
          console.warn('[FCM] Ticket push token delivery failed', {
            employeeId,
            ticketId,
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
    console.error(`[FCM] Error sending ticket push notification to employee ${employeeId}:`, error);
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

export async function sendCalendarEventTagPushNotification(params: {
  employeeId: string;
  eventTitle: string;
  eventId: string;
  taggedByName: string;
  title?: string;
  body?: string;
}): Promise<CalendarEventTagPushNotificationResult> {
  const { employeeId, eventTitle, eventId, taggedByName } = params;

  if (!firebaseAdmin.apps.length) {
    console.warn('[FCM] Calendar event tag push skipped: Firebase Admin SDK not initialized', {
      employeeId,
      eventId,
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
      console.info('[FCM] Calendar event tag push skipped: no registered tokens', {
        employeeId,
        eventId,
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
    const title = params.title ?? "You've been tagged in an event";
    const body = params.body ?? `${taggedByName} tagged you in "${eventTitle}"`;
    const androidNotification = {
      title,
      body,
      channelId: CALENDAR_NOTIFICATION_CHANNEL_ID,
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
        type: 'calendar_event_tagged',
        eventId: String(eventId),
        eventTitle,
        taggedByName,
        targetPath: `/calendar/events/${eventId}/detail`,
      },
      webpush: {
        fcmOptions: {
          link: `${WEB_APP_URL}/employee/calendar?eventId=${eventId}`,
        },
      },
      tokens: tokenStrings,
    };

    console.info('[FCM] Sending calendar event tag push notification', {
      employeeId,
      eventId,
      tokenCount: tokenStrings.length,
    });

    const response = await firebaseAdmin.messaging().sendEachForMulticast(message);
    console.info('[FCM] Calendar event tag push send result', {
      employeeId,
      eventId,
      successCount: response.successCount,
      failureCount: response.failureCount,
    });

    let staleTokenCount = 0;
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
          }
        }
      });

      if (failedTokens.length > 0) {
        staleTokenCount = failedTokens.length;
        await removeStaleFcmTokens(failedTokens);
        console.warn('[FCM] Removed stale FCM tokens after calendar event tag push', {
          employeeId,
          eventId,
          staleTokenCount,
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
    console.error(`[FCM] Error sending calendar event tag push notification to employee ${employeeId}:`, error);
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

export async function sendCalendarEventReminderPushNotification(params: {
  employeeId: string;
  eventTitle: string;
  eventId: string;
  minutesBefore: number;
  title?: string;
  body?: string;
}): Promise<CalendarEventTagPushNotificationResult> {
  const { employeeId, eventTitle, eventId, minutesBefore } = params;

  if (!firebaseAdmin.apps.length) {
    console.warn('[FCM] Calendar event reminder push skipped: Firebase Admin SDK not initialized', {
      employeeId,
      eventId,
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
    const title = params.title ?? `Reminder: ${eventTitle}`;
    const body = params.body ?? `Your event "${eventTitle}" starts in ${minutesBefore} minute(s)`;

    const message = {
      notification: { title, body },
      android: {
        priority: 'high' as const,
        notification: { title, body, channelId: CALENDAR_NOTIFICATION_CHANNEL_ID, sound: 'default' },
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: { aps: { alert: { title, body }, sound: 'default', 'content-available': 1 } },
      },
      data: {
        type: 'calendar_event_reminder',
        eventId: String(eventId),
        eventTitle,
        targetPath: `/calendar/events/${eventId}/detail`,
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
    console.error(`[FCM] Error sending calendar event reminder push to employee ${employeeId}:`, error);
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
