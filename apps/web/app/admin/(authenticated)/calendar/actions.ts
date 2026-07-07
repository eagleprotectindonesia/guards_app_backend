'use server';

import {
  prisma,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getCalendarEventTags,
} from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { createCalendarEventSchema, updateCalendarEventSchema } from '@repo/validations';
import { notifyCalendarEventTags, validateTaggedUsers } from '@/lib/calendar-notifications';
import { redis } from '@repo/database/redis';
import { revalidatePath } from 'next/cache';

async function getAdminName(id: string): Promise<string> {
  const admin = await prisma.admin.findUnique({ where: { id }, select: { name: true } });
  return admin?.name ?? 'Admin';
}

export async function createEvent(data: unknown) {
  const session = await requirePermission('user-calendar:create');

  const parsed = createCalendarEventSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues };
  }

  const body = parsed.data;
  const taggedEmployeeIds = body.taggedEmployeeIds ?? [];
  const taggedAdminIds = body.taggedAdminIds ?? [];

  if (taggedEmployeeIds.length > 0 || taggedAdminIds.length > 0) {
    const validationErrors = await validateTaggedUsers(taggedEmployeeIds, taggedAdminIds);
    if (validationErrors.length > 0) {
      return { success: false, error: validationErrors.join('; ') };
    }
  }

  const adminName = await getAdminName(session.id);

  const event = await prisma.$transaction(async tx => {
    return createCalendarEvent(
      {
        adminId: session.id,
        kind: body.kind,
        title: body.title,
        description: body.description,
        startDate: body.startDate,
        endDate: body.endDate,
        startTime: body.startTime,
        endTime: body.endTime,
        allDay: body.allDay,
        location: body.location,
        clientName: body.clientName,
        trainerName: body.trainerName,
        priority: body.priority,
        color: body.color,
        taggedEmployeeIds,
        taggedAdminIds,
      },
      tx
    );
  });

  if (taggedEmployeeIds.length > 0 || taggedAdminIds.length > 0) {
    await notifyCalendarEventTags(event.id, body.title, taggedEmployeeIds, taggedAdminIds, adminName);
  }

  redis
    .publish(
      'events:calendar',
      JSON.stringify({
        type: 'calendar:event_created',
        data: { eventId: event.id, kind: body.kind, adminId: session.id },
      })
    )
    .catch(err => console.error('[Calendar] Redis publish error:', err));

  revalidatePath('/admin/calendar');
  return { success: true };
}

export async function updateEvent(id: string, data: unknown) {
  const session = await requirePermission('user-calendar:edit');

  const existing = await prisma.calendarEvent.findFirst({
    where: { id, adminId: session.id, deletedAt: null },
  });

  if (!existing) {
    return { success: false, error: 'Calendar event not found' };
  }

  const parsed = updateCalendarEventSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues };
  }

  const body = parsed.data;

  const taggedEmployeeIds = body.taggedEmployeeIds !== undefined ? (body.taggedEmployeeIds ?? []) : undefined;
  const taggedAdminIds = body.taggedAdminIds;

  if ((taggedEmployeeIds && taggedEmployeeIds.length > 0) || (taggedAdminIds && taggedAdminIds.length > 0)) {
    const validationErrors = await validateTaggedUsers(taggedEmployeeIds ?? [], taggedAdminIds ?? []);
    if (validationErrors.length > 0) {
      return { success: false, error: validationErrors.join('; ') };
    }
  }

  const oldTags = await getCalendarEventTags(id);
  const oldEmployeeIds = oldTags.filter(t => t.type === 'employee').map(t => t.id);
  const oldAdminIds = oldTags.filter(t => t.type === 'admin').map(t => t.id);

  const newEmployeeIds = taggedEmployeeIds ?? oldEmployeeIds;
  const newAdminIds = taggedAdminIds ?? oldAdminIds;

  await updateCalendarEvent(id, {
    kind: body.kind,
    title: body.title,
    description: body.description,
    startDate: body.startDate,
    endDate: body.endDate,
    startTime: body.startTime,
    endTime: body.endTime,
    allDay: body.allDay,
    location: body.location,
    clientName: body.clientName,
    trainerName: body.trainerName,
    priority: body.priority,
    color: body.color,
    taggedEmployeeIds: newEmployeeIds,
    taggedAdminIds: newAdminIds,
  });

  const newlyTaggedEmployees = newEmployeeIds.filter(uid => !oldEmployeeIds.includes(uid));
  const newlyTaggedAdmins = newAdminIds.filter(uid => !oldAdminIds.includes(uid));

  if (newlyTaggedEmployees.length > 0 || newlyTaggedAdmins.length > 0) {
    const adminName = await getAdminName(session.id);
    await notifyCalendarEventTags(id, body.title ?? existing.title, newlyTaggedEmployees, newlyTaggedAdmins, adminName);
  }

  redis
    .publish(
      'events:calendar',
      JSON.stringify({
        type: 'calendar:event_updated',
        data: { eventId: id, adminId: session.id },
      })
    )
    .catch(err => console.error('[Calendar] Redis publish error:', err));

  revalidatePath('/admin/calendar');
  return { success: true };
}

export async function deleteEvent(id: string) {
  const session = await requirePermission('user-calendar:delete');

  const existing = await prisma.calendarEvent.findFirst({
    where: { id, adminId: session.id, deletedAt: null },
  });

  if (!existing) {
    return { success: false, error: 'Calendar event not found' };
  }

  await deleteCalendarEvent(id);

  redis
    .publish(
      'events:calendar',
      JSON.stringify({
        type: 'calendar:event_deleted',
        data: { eventId: id, adminId: session.id },
      })
    )
    .catch(err => console.error('[Calendar] Redis publish error:', err));

  revalidatePath('/admin/calendar');
  return { success: true };
}

export async function duplicateEvent(id: string) {
  const session = await requirePermission('user-calendar:create');

  const existing = await prisma.calendarEvent.findFirst({
    where: { id, adminId: session.id, deletedAt: null },
  });

  if (!existing) {
    return { success: false, error: 'Calendar event not found' };
  }

  const event = await createCalendarEvent({
    adminId: session.id,
    kind: existing.kind,
    title: existing.title,
    description: existing.description ?? undefined,
    startDate: existing.startDate.toISOString().slice(0, 10),
    endDate: existing.endDate.toISOString().slice(0, 10),
    startTime: existing.startTime ?? undefined,
    endTime: existing.endTime ?? undefined,
    allDay: existing.allDay,
    location: existing.location ?? undefined,
    clientName: existing.clientName ?? undefined,
    trainerName: existing.trainerName ?? undefined,
    priority: existing.priority ?? undefined,
    color: existing.color ?? undefined,
  });

  redis
    .publish(
      'events:calendar',
      JSON.stringify({
        type: 'calendar:event_created',
        data: { eventId: event.id, kind: existing.kind, adminId: session.id },
      })
    )
    .catch(err => console.error('[Calendar] Redis publish error:', err));

  revalidatePath('/admin/calendar');
  return { success: true };
}
