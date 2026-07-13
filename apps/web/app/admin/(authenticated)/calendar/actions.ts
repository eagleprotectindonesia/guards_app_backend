'use server';

import {
  prisma,
  createCalendarEventWithChangelog,
  updateCalendarEventWithChangelog,
  deleteCalendarEventWithChangelog,
  getCalendarEventTags,
  findParticipantAvailabilityConflicts,
  type TaggedUserResult,
} from '@repo/database';
import { serializeCalendarEvent } from '@repo/shared';
import { getAdminAuthSession } from '@/lib/admin-auth';
import { createCalendarEventSchema, updateCalendarEventSchema, tagAvailabilityCheckSchema } from '@repo/validations';
import { getAdminName, notifyCalendarEventTags, validateTaggedUsers } from '@/lib/calendar-notifications';
import { redis } from '@repo/database/redis';
import { revalidatePath } from 'next/cache';
import { format } from 'date-fns';

export async function createEvent(data: unknown) {
  const session = await getAdminAuthSession();
  if (!session) return { success: false, error: 'Not authenticated' };

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
    return createCalendarEventWithChangelog(
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
        reminderMinutesBefore: body.reminderMinutesBefore,
        taggedEmployeeIds,
        taggedAdminIds,
      },
      { type: 'admin', id: session.id },
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
  const session = await getAdminAuthSession();
  if (!session) return { success: false, error: 'Not authenticated' };

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

  await prisma.$transaction(async tx => {
    await updateCalendarEventWithChangelog(
      id,
      {
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
        reminderMinutesBefore: body.reminderMinutesBefore,
        taggedEmployeeIds: newEmployeeIds,
        taggedAdminIds: newAdminIds,
      },
      { type: 'admin', id: session.id },
      tx,
    );
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
  const session = await getAdminAuthSession();
  if (!session) return { success: false, error: 'Not authenticated' };

  const existing = await prisma.calendarEvent.findFirst({
    where: { id, adminId: session.id, deletedAt: null },
  });

  if (!existing) {
    return { success: false, error: 'Calendar event not found' };
  }

  await prisma.$transaction(async tx => {
    await deleteCalendarEventWithChangelog(id, { type: 'admin', id: session.id }, tx);
  });

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

export interface EventForEditItem {
  kind: string;
  title: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  reminderMinutesBefore: number | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  clientName: string | null;
  trainerName: string | null;
  priority: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  taggedUsers: TaggedUserResult[];
  isOwner: boolean;
  ownerId: string;
  ownerType: 'admin';
  ownerName: string;
}

type EventForEditResult = { success: true; item: EventForEditItem } | { success: false; error: string };

export async function getEventForEdit(id: string): Promise<EventForEditResult> {
  const session = await getAdminAuthSession();
  if (!session) return { success: false, error: 'Not authenticated' };

  const event = await prisma.calendarEvent.findFirst({
    where: { id, adminId: session.id, deletedAt: null },
  });

  if (!event) {
    return { success: false, error: 'Calendar event not found' };
  }

  const [adminName, taggedUsers] = await Promise.all([getAdminName(session.id), getCalendarEventTags(id)]);

  const serialized = serializeCalendarEvent(event as unknown as Record<string, unknown>);

  return {
    success: true,
    item: {
      ...serialized,
      taggedUsers,
      isOwner: true,
      ownerId: session.id,
      ownerType: 'admin',
      ownerName: adminName,
    } as unknown as EventForEditItem,
  };
}

export async function checkTagAvailability(input: unknown) {
  const session = await getAdminAuthSession();
  if (!session) return { conflicts: {} };

  const parsed = tagAvailabilityCheckSchema.safeParse(input);
  if (!parsed.success) {
    return { conflicts: {} };
  }

  const { startDate, endDate, startTime, endTime, allDay, participants, excludeEventId } = parsed.data;

  const conflicts = await findParticipantAvailabilityConflicts({
    participants,
    fromDate: startDate,
    toDate: endDate,
    allDay,
    startTime: startTime ?? null,
    endTime: endTime ?? null,
    excludeEventId,
  });

  return { conflicts };
}

export async function duplicateEvent(id: string) {
  const session = await getAdminAuthSession();
  if (!session) return { success: false, error: 'Not authenticated' };

  const existing = await prisma.calendarEvent.findFirst({
    where: { id, adminId: session.id, deletedAt: null },
  });

  if (!existing) {
    return { success: false, error: 'Calendar event not found' };
  }

  const event = await prisma.$transaction(async tx => {
    return createCalendarEventWithChangelog(
      {
        adminId: session.id,
        kind: existing.kind,
        title: existing.title,
        description: existing.description ?? undefined,
        startDate: format(existing.startDate, 'yyyy-MM-dd'),
        endDate: format(existing.endDate, 'yyyy-MM-dd'),
        startTime: existing.startTime ?? undefined,
        endTime: existing.endTime ?? undefined,
        allDay: existing.allDay,
        location: existing.location ?? undefined,
        clientName: existing.clientName ?? undefined,
        trainerName: existing.trainerName ?? undefined,
        priority: existing.priority ?? undefined,
        reminderMinutesBefore: existing.reminderMinutesBefore ?? undefined,
      },
      { type: 'admin', id: session.id },
      tx,
    );
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
