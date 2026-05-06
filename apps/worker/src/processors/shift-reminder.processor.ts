import { Job } from 'bullmq';
import { BatchResponse, SendResponse } from 'firebase-admin/messaging';
import { firebaseAdmin } from '../lib/firebase-admin';
import {
  SHIFT_REMINDER_JOB_NAME,
  getEmployeeFcmTokens,
  removeStaleFcmTokens,
  SHIFT_REMINDER_WINDOW_MINUTES,
  getOnsiteShiftReminderCandidates,
  getOfficeShiftReminderCandidates,
  claimOnsiteShiftReminder,
  claimOfficeShiftReminder,
} from '@repo/database';

const WEB_APP_URL = process.env.WEB_APP_URL || 'http://localhost:3000';

const maskToken = (token: string) => (token.length <= 8 ? token : token.slice(-8));

export class ShiftReminderProcessor {
  async process(job: Job) {
    if (job.name === SHIFT_REMINDER_JOB_NAME) {
      await this.sendDueReminders();
    }
  }

  private async sendDueReminders() {
    const now = new Date();

    const [onsiteCandidates, officeCandidates] = await Promise.all([
      getOnsiteShiftReminderCandidates(now, SHIFT_REMINDER_WINDOW_MINUTES),
      getOfficeShiftReminderCandidates(now, SHIFT_REMINDER_WINDOW_MINUTES),
    ]);

    for (const shift of onsiteCandidates) {
      if (!shift.employeeId) continue;
      const claimed = await claimOnsiteShiftReminder(shift.id, now);
      if (!claimed) continue;

      await this.sendReminderPush({
        employeeId: shift.employeeId,
        title: 'Shift reminder',
        body: `Your ${shift.shiftType?.name ?? 'shift'} at ${shift.site?.name ?? 'assigned site'} starts in less than 30 minutes.`,
        data: {
          type: 'shift_reminder',
          shiftKind: 'onsite',
          shiftId: shift.id,
          startsAt: shift.startsAt.toISOString(),
        },
      });
    }

    for (const shift of officeCandidates) {
      const claimed = await claimOfficeShiftReminder(shift.id, now);
      if (!claimed) continue;

      await this.sendReminderPush({
        employeeId: shift.employeeId,
        title: 'Office shift reminder',
        body: `Your ${shift.officeShiftType?.name ?? 'office shift'} starts in less than 30 minutes.`,
        data: {
          type: 'shift_reminder',
          shiftKind: 'office',
          officeShiftId: shift.id,
          startsAt: shift.startsAt.toISOString(),
        },
      });
    }
  }

  private async sendReminderPush(params: {
    employeeId: string;
    title: string;
    body: string;
    data: Record<string, string>;
  }) {
    const { employeeId, title, body, data } = params;

    if (!firebaseAdmin.apps.length) {
      console.warn('[FCM] Shift reminder skipped: Firebase Admin SDK not initialized', { employeeId, data });
      return;
    }

    const tokensResult = await getEmployeeFcmTokens(employeeId);
    if (tokensResult.length === 0) {
      return;
    }

    const tokenStrings = tokensResult.map(t => t.token);
    const message = {
      notification: { title, body },
      android: {
        priority: 'high' as const,
        notification: {
          title,
          body,
          sound: 'default',
        },
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
      data,
      webpush: {
        fcmOptions: {
          link: `${WEB_APP_URL}/employee`,
        },
      },
      tokens: tokenStrings,
    };

    const response: BatchResponse = await firebaseAdmin.messaging().sendEachForMulticast(message);

    if (response.failureCount <= 0) return;

    const failedTokens: string[] = [];
    response.responses.forEach((resp: SendResponse, idx: number) => {
      if (!resp.success) {
        const errorCode = resp.error?.code;
        console.warn('[FCM] Shift reminder token delivery failed', {
          employeeId,
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
      await removeStaleFcmTokens(failedTokens);
    }
  }
}
