'use server';

import {
  createOfficeWorkSchedule,
  deleteOfficeWorkSchedule,
  getOfficeWorkScheduleById,
  updateOfficeWorkSchedule,
} from '@repo/database';
import {
  updateOfficeWorkScheduleSchema,
  UpdateOfficeWorkScheduleInput,
} from '@repo/validations';
import { ActionState } from '@/types/actions';
import { revalidatePath } from 'next/cache';
import { getAdminIdFromToken, requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { isOfficeWorkSchedulesEnabled } from '@/lib/feature-flags';

function slugifyScheduleCode(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'office-schedule'
  );
}

function parseDays(formData: FormData) {
  const daysRaw = formData.get('days');
  if (typeof daysRaw !== 'string') return [];

  try {
    return JSON.parse(daysRaw);
  } catch {
    return [];
  }
}

export async function createOfficeWorkScheduleAction(
  prevState: ActionState<UpdateOfficeWorkScheduleInput>,
  formData: FormData
): Promise<ActionState<UpdateOfficeWorkScheduleInput>> {
  if (!isOfficeWorkSchedulesEnabled()) {
    return {
      success: false,
      message: 'Office schedules are currently disabled.',
    };
  }

  const session = await requirePermission(PERMISSIONS.OFFICE_WORK_SCHEDULES.CREATE);

  const validatedFields = updateOfficeWorkScheduleSchema.safeParse({
    name: formData.get('name'),
    days: parseDays(formData),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Invalid input. Failed to create office schedule.',
      success: false,
    };
  }

  try {
    const code = `${slugifyScheduleCode(validatedFields.data.name)}-${Date.now()}`;
    await createOfficeWorkSchedule({
      name: validatedFields.data.name,
      code,
      days: validatedFields.data.days,
      adminId: session.id,
    });
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to create office schedule.',
      success: false,
    };
  }

  revalidatePath('/admin/office-work-schedules');
  revalidatePath('/admin/office-work-schedules/audit');
  return { success: true, message: 'Office schedule created successfully.' };
}

export async function updateOfficeWorkScheduleAction(
  id: string,
  prevState: ActionState<UpdateOfficeWorkScheduleInput>,
  formData: FormData
): Promise<ActionState<UpdateOfficeWorkScheduleInput>> {
  if (!isOfficeWorkSchedulesEnabled()) {
    return {
      success: false,
      message: 'Office schedules are currently disabled.',
    };
  }

  const session = await requirePermission(PERMISSIONS.OFFICE_WORK_SCHEDULES.EDIT);

  const validatedFields = updateOfficeWorkScheduleSchema.safeParse({
    name: formData.get('name'),
    days: parseDays(formData),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Invalid input. Failed to update office schedule.',
      success: false,
    };
  }

  try {
    const existing = await getOfficeWorkScheduleById(id);
    if (!existing) {
      return {
        message: 'Office schedule not found.',
        success: false,
      };
    }

    await updateOfficeWorkSchedule({
      id,
      name: validatedFields.data.name,
      days: validatedFields.data.days,
      adminId: session.id,
    });
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to update office schedule.',
      success: false,
    };
  }

  revalidatePath('/admin/office-work-schedules');
  revalidatePath('/admin/office-work-schedules/audit');
  revalidatePath(`/admin/office-work-schedules/${id}/edit`);
  return { success: true, message: 'Office schedule updated successfully.' };
}

export async function deleteOfficeWorkScheduleAction(
  id: string
): Promise<{ success: boolean; message?: string }> {
  if (!isOfficeWorkSchedulesEnabled()) {
    return {
      success: false,
      message: 'Office schedules are currently disabled.',
    };
  }

  await requirePermission(PERMISSIONS.OFFICE_WORK_SCHEDULES.DELETE);
  const adminId = await getAdminIdFromToken();

  try {
    const existing = await getOfficeWorkScheduleById(id);
    if (!existing) {
      return {
        success: false,
        message: 'Office schedule not found.',
      };
    }

    await deleteOfficeWorkSchedule({
      id,
      actor: adminId ? { type: 'admin', id: adminId } : { type: 'unknown' },
    });
  } catch (error) {
    console.error('Database Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Database Error: Failed to delete office schedule.',
    };
  }

  revalidatePath('/admin/office-work-schedules');
  revalidatePath('/admin/office-work-schedules/audit');
  return { success: true, message: 'Office schedule deleted successfully.' };
}
