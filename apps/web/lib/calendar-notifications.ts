import type { AdminNotificationType } from '@prisma/client';
import { prisma, createAdminNotifications } from '@repo/database';
import { sendCalendarEventTagPushNotification } from '@repo/notifications';

export async function notifyCalendarEventTags(
  eventId: string,
  eventTitle: string,
  taggedEmployeeIds: string[],
  taggedAdminIds: string[],
  taggedByName: string
) {
  const results = { employeeNotified: 0, adminNotified: 0 };

  for (const empId of taggedEmployeeIds) {
    try {
      await sendCalendarEventTagPushNotification({
        employeeId: empId,
        eventTitle,
        eventId,
        taggedByName,
      });
      results.employeeNotified++;
    } catch (err) {
      console.error(`[CalendarTag] Failed to notify employee ${empId}:`, err);
    }
  }

  if (taggedAdminIds.length > 0) {
    try {
      await createAdminNotifications({
        adminIds: taggedAdminIds,
        type: 'calendar_event_tagged' as AdminNotificationType,
        title: "You've been tagged in an event",
        body: `${taggedByName} tagged you in "${eventTitle}"`,
        payload: { eventId, eventTitle, taggedByName },
      });
      results.adminNotified = taggedAdminIds.length;
    } catch (err) {
      console.error(`[CalendarTag] Failed to notify admins:`, err);
    }
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
    const foundIds = new Set(employees.map((e) => e.id));
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
    const foundIds = new Set(admins.map((a) => a.id));
    for (const id of taggedAdminIds) {
      if (!foundIds.has(id)) {
        errors.push(`Admin ${id} not found`);
      }
    }
  }

  return errors;
}
