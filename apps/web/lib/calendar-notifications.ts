import { prisma, createAdminNotifications } from '@repo/database';
import { sendCalendarEventTagPushNotification } from '@repo/notifications';
import { redis } from '@repo/database/redis';
import { locales } from '@repo/shared';

const en = locales.en;

export async function getAdminName(id: string): Promise<string> {
  const admin = await prisma.admin.findUnique({ where: { id }, select: { name: true } });
  return admin?.name ?? 'Admin';
}

export async function resolveDepartmentMemberIds(departmentNames: string[]): Promise<{
  employeeIds: string[];
  adminIds: string[];
}> {
  if (departmentNames.length === 0) return { employeeIds: [], adminIds: [] };

  const [employees, ownerships] = await Promise.all([
    prisma.employee.findMany({
      where: {
        department: { in: departmentNames },
        status: true,
        deletedAt: null,
      },
      select: { id: true },
    }),
    prisma.adminOwnershipAssignment.findMany({
      where: {
        departmentKey: { in: departmentNames },
        isActive: true,
      },
      select: { adminId: true },
    }),
  ]);

  return {
    employeeIds: employees.map(e => e.id),
    adminIds: [...new Set(ownerships.map(o => o.adminId))],
  };
}

export async function notifyCalendarEventTags(
  eventId: string,
  eventTitle: string,
  taggedEmployeeIds: string[],
  taggedAdminIds: string[],
  taggedByName: string,
  taggedDepartmentNames: string[] = []
) {
  const results = { employeeNotified: 0, adminNotified: 0 };

  // Resolve department names to actual employee and admin IDs
  const { employeeIds: deptEmployeeIds, adminIds: deptAdminIds } =
    await resolveDepartmentMemberIds(taggedDepartmentNames);

  const allEmployeeIds = [...new Set([...taggedEmployeeIds, ...deptEmployeeIds])];
  const allAdminIds = [...new Set([...taggedAdminIds, ...deptAdminIds])];

  const title = en.calendar.eventTaggedTitle;
  const body = en.calendar.eventTaggedBody.replace('{name}', taggedByName).replace('{title}', eventTitle);

  for (const empId of allEmployeeIds) {
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

  if (allAdminIds.length > 0) {
    for (const adminId of allAdminIds) {
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

    const calendarEvent = await prisma.calendarEvent.findUnique({
      where: { id: eventId },
      select: { startDate: true },
    });
    const d = calendarEvent?.startDate;
    const eventDate = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';

    await createAdminNotifications({
      adminIds: allAdminIds,
      type: 'calendar_event_tagged',
      title,
      body,
      payload: { eventId, eventTitle, taggedByName, targetPath: eventDate ? `/admin/calendar?view=day&date=${eventDate}` : '/admin/calendar' },
    }).catch(err => console.error('[CalendarTag] Failed to persist admin notifications:', err));

    results.adminNotified = allAdminIds.length;
  }

  return results;
}

export async function validateTaggedUsers(
  taggedEmployeeIds: string[] | undefined,
  taggedAdminIds: string[] | undefined,
  taggedDepartmentNames: string[] | undefined
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

  if (taggedDepartmentNames && taggedDepartmentNames.length > 0) {
    const departments = await prisma.employee.findMany({
      where: {
        department: { in: taggedDepartmentNames },
        status: true,
        deletedAt: null,
      },
      distinct: ['department'],
      select: { department: true },
    });
    const foundNames = new Set(departments.map(d => d.department!));
    for (const name of taggedDepartmentNames) {
      if (!foundNames.has(name)) {
        errors.push(`Department "${name}" not found`);
      }
    }
  }

  return errors;
}
