import { Job } from 'bullmq';
import {
  CALENDAR_EVENT_REMINDER_JOB_NAME,
  getCalendarEventReminderCandidates,
  claimCalendarEventReminders,
  createAdminNotifications,
} from '@repo/database';
import { sendCalendarEventReminderPushNotification } from '@repo/notifications';
import { redis } from '@repo/database/redis';

export class CalendarEventReminderProcessor {
  async process(job: Job) {
    if (job.name === CALENDAR_EVENT_REMINDER_JOB_NAME) {
      await this.sendDueReminders();
    }
  }

  private async sendDueReminders() {
    const now = new Date();

    const candidates = await getCalendarEventReminderCandidates(now);

    if (candidates.length === 0) return;

    const ids = candidates.map(c => c.id);
    const claimed = await claimCalendarEventReminders(ids, now);

    if (claimed === 0) return;

    const claimedSet = new Set(ids.slice(0, claimed));
    const claimedEvents = candidates.filter(c => claimedSet.has(c.id));

    for (const event of claimedEvents) {
      try {
        await this.notifyEventReminder(event);
      } catch (err) {
        console.error(`[CalendarEventReminder] Failed to process event ${event.id}:`, err);
      }
    }
  }

  private async notifyEventReminder(event: {
    id: string;
    employeeId: string | null;
    adminId: string | null;
    title: string;
    reminderMinutesBefore: number | null;
    tags: { id: string; participantType: string; employeeId: string | null; adminId: string | null }[];
  }) {
    const eventId = event.id;
    const eventTitle = event.title;
    const minutesBefore = event.reminderMinutesBefore ?? 0;

    const titleString = `Reminder: ${eventTitle}`;
    let bodyString: string;
    if (minutesBefore <= 0) {
      bodyString = `"${eventTitle}" is starting now.`;
    } else if (minutesBefore < 60) {
      bodyString = `"${eventTitle}" starts in ${minutesBefore} minute(s).`;
    } else if (minutesBefore < 1440) {
      bodyString = `"${eventTitle}" starts in ${Math.round(minutesBefore / 60)} hour(s).`;
    } else {
      bodyString = `"${eventTitle}" starts in ${Math.round(minutesBefore / 1440)} day(s).`;
    }

    if (event.employeeId) {
      try {
        await sendCalendarEventReminderPushNotification({
          employeeId: event.employeeId,
          eventTitle,
          eventId,
          minutesBefore,
          title: titleString,
          body: bodyString,
        });
      } catch (err) {
        console.error(`[CalendarEventReminder] FCM push failed for employee ${event.employeeId}:`, err);
      }
    }

    if (event.adminId) {
      try {
        await createAdminNotifications({
          adminIds: [event.adminId],
          type: 'calendar_event_reminder',
          title: titleString,
          body: bodyString,
          payload: { eventId, eventTitle, minutesBefore },
        });
      } catch (err) {
        console.error(`[CalendarEventReminder] Admin notification failed for admin ${event.adminId}:`, err);
      }
    }

    for (const tag of event.tags) {
      if (tag.employeeId) {
        try {
          await sendCalendarEventReminderPushNotification({
            employeeId: tag.employeeId,
            eventTitle,
            eventId,
            minutesBefore,
            title: titleString,
            body: `${bodyString} (you are tagged)`,
          });
        } catch (err) {
          console.error(`[CalendarEventReminder] FCM push failed for tagged employee ${tag.employeeId}:`, err);
        }
      }
      if (tag.adminId) {
        try {
          await createAdminNotifications({
            adminIds: [tag.adminId],
            type: 'calendar_event_reminder',
            title: titleString,
            body: `${bodyString} (you are tagged)`,
            payload: { eventId, eventTitle, minutesBefore },
          });
        } catch (err) {
          console.error(`[CalendarEventReminder] Admin notification failed for tagged admin ${tag.adminId}:`, err);
        }
      }
    }

    redis.publish(
      'events:calendar',
      JSON.stringify({
        type: 'calendar:event_reminder_sent',
        data: { eventId, eventTitle, minutesBefore },
      })
    ).catch(err => console.error('[CalendarEventReminder] Redis publish error:', err));
  }
}
