import { prisma, createAdminNotifications } from '@repo/database';
import { sendCalendarEventTagPushNotification } from '@repo/notifications';
import { redis } from '@repo/database/redis';
import { locales } from '@repo/shared';

const en = locales.en;

export async function notifyCalendarEventTags(
  eventId: string,
  eventTitle: string,
  taggedEmployeeIds: string[],
  taggedAdminIds: string[],
  taggedByName: string
) {
  const results = { employeeNotified: 0, adminNotified: 0 };

  const title = en.calendar.eventTaggedTitle;
  const body = en.calendar.eventTaggedBody.replace('{name}', taggedByName).replace('{title}', eventTitle);

  for (const empId of taggedEmployeeIds) {
    try {
      await sendCalendarEventTagPushNotification({
        employeeId: empId,
        eventTitle,
        eventId,
        taggedByName,
        title,
        body,
      });
      results.employeeNotified++;
    } catch (err) {
      console.error(`[CalendarTag] Failed to notify employee ${empId}:`, err);
    }

    redis
      .publish(
        'events:calendar',
        JSON.stringify({
          type: 'calendar:event_tagged',
          data: { eventId, eventTitle, taggedByName, employeeId: empId },
        })
      )
      .catch(err => console.error('[Calendar] Redis publish error:', err));
  }

  if (taggedAdminIds.length > 0) {
    for (const adminId of taggedAdminIds) {
      redis
        .publish(
          'events:calendar',
          JSON.stringify({
            type: 'calendar:event_tagged',
            data: { eventId, eventTitle, taggedByName, adminId },
          })
        )
        .catch(err => console.error('[Calendar] Redis publish error:', err));
    }

    await createAdminNotifications({
      adminIds: taggedAdminIds,
      type: 'calendar_event_tagged',
      title,
      body,
      payload: { eventId, eventTitle, taggedByName },
    }).catch(err => console.error('[CalendarTag] Failed to persist admin notifications:', err));

    results.adminNotified = taggedAdminIds.length;
  }

  return results;
}

export async function validateTaggedUsers(
  taggedEmployeeIds: string[] | undefined,
  taggedAdminIds: string[] | undefined
) {
  const errors: string[] = [];

  if (taggedEmployeeIds && taggedEmployeeIds.length > 0) {
    const employees = await prisma.employee.findMany({
      where: { id: { in: taggedEmployeeIds }, deletedAt: null },
      select: { id: true },
    });
    const foundIds = new Set(employees.map(e => e.id));
    for (const id of taggedEmployeeIds) {
      if (!foundIds.has(id)) {
        errors.push(`Employee ${id} not found`);
      }
    }
  }

  if (taggedAdminIds && taggedAdminIds.length > 0) {
    const admins = await prisma.admin.findMany({
      where: { id: { in: taggedAdminIds }, deletedAt: null },
      select: { id: true },
    });
    const foundIds = new Set(admins.map(a => a.id));
    for (const id of taggedAdminIds) {
      if (!foundIds.has(id)) {
        errors.push(`Admin ${id} not found`);
      }
    }
  }

  return errors;
}
