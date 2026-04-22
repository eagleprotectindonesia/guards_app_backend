'use server';

import { revalidatePath } from 'next/cache';
import {
  createHolidayCalendarEntry,
  updateHolidayCalendarEntry,
  deleteHolidayCalendarEntry,
  prisma,
} from '@repo/database';
import { holidayCalendarEntrySchema } from '@repo/validations';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

type ActionResult = {
  success: boolean;
  message?: string;
};

function revalidateHolidayPaths() {
  revalidatePath('/admin/holiday-calendars');
}

function parseFormPayload(formData: FormData) {
  const payload = {
    startDate: String(formData.get('startDate') || ''),
    endDate: String(formData.get('endDate') || ''),
    title: String(formData.get('title') || ''),
    type: String(formData.get('type') || ''),
    scope: String(formData.get('scope') || ''),
    departmentKeys: formData
      .getAll('departmentKeys')
      .map(value => String(value).trim().toLowerCase())
      .filter(Boolean),
    isPaid: String(formData.get('isPaid') || 'false') === 'true',
    affectsAttendance: String(formData.get('affectsAttendance') || 'false') === 'true',
    notificationRequired: String(formData.get('notificationRequired') || 'false') === 'true',
    note: String(formData.get('note') || '').trim() || undefined,
  };

  return holidayCalendarEntrySchema.safeParse(payload);
}

export async function createHolidayCalendarEntryAction(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission(PERMISSIONS.HOLIDAY_CALENDARS.CREATE);
  const parsed = parseFormPayload(formData);

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message || 'Invalid input.' };
  }

  try {
    const created = await createHolidayCalendarEntry(parsed.data, session.id);

    if (parsed.data.notificationRequired) {
      await prisma.changelog.create({
        data: {
          action: 'CREATE',
          entityType: 'HolidayCalendarNotification',
          entityId: created.id,
          actor: 'admin',
          actorId: session.id,
          details: {
            message: 'Notification required for holiday entry creation.',
            title: parsed.data.title,
            startDate: parsed.data.startDate,
            endDate: parsed.data.endDate,
          },
        },
      });
    }

    revalidateHolidayPaths();
    return { success: true, message: 'Holiday entry created.' };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Failed to create holiday entry.' };
  }
}

export async function updateHolidayCalendarEntryAction(id: string, formData: FormData): Promise<ActionResult> {
  const session = await requirePermission(PERMISSIONS.HOLIDAY_CALENDARS.EDIT);
  const parsed = parseFormPayload(formData);

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message || 'Invalid input.' };
  }

  try {
    await updateHolidayCalendarEntry(id, parsed.data, session.id);

    if (parsed.data.notificationRequired) {
      await prisma.changelog.create({
        data: {
          action: 'UPDATE',
          entityType: 'HolidayCalendarNotification',
          entityId: id,
          actor: 'admin',
          actorId: session.id,
          details: {
            message: 'Notification required for holiday entry update.',
            title: parsed.data.title,
            startDate: parsed.data.startDate,
            endDate: parsed.data.endDate,
          },
        },
      });
    }

    revalidateHolidayPaths();
    return { success: true, message: 'Holiday entry updated.' };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Failed to update holiday entry.' };
  }
}

export async function deleteHolidayCalendarEntryAction(id: string): Promise<ActionResult> {
  const session = await requirePermission(PERMISSIONS.HOLIDAY_CALENDARS.DELETE);

  try {
    await deleteHolidayCalendarEntry(id, session.id);
    revalidateHolidayPaths();
    return { success: true, message: 'Holiday entry deleted.' };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Failed to delete holiday entry.' };
  }
}
