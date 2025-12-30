'use server';

import {
  createShiftTypeWithChangelog,
  updateShiftTypeWithChangelog,
  deleteShiftTypeWithChangelog,
  updateFutureShifts,
} from '@/lib/data-access/shift-types';
import { createShiftTypeSchema } from '@/lib/validations';
import { revalidatePath } from 'next/cache';
import { getAdminIdFromToken } from '@/lib/admin-auth';

export type ActionState = {
  message?: string;
  errors?: {
    name?: string[];
    startTime?: string[];
    endTime?: string[];
  };
  success?: boolean;
};

export async function createShiftType(prevState: ActionState, formData: FormData): Promise<ActionState> {
  const adminId = await getAdminIdFromToken();
  const validatedFields = createShiftTypeSchema.safeParse({
    name: formData.get('name'),
    startTime: formData.get('startTime'),
    endTime: formData.get('endTime'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Shift Type.',
      success: false,
    };
  }

  try {
    await createShiftTypeWithChangelog(validatedFields.data, adminId!);
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to Create Shift Type.',
      success: false,
    };
  }

  revalidatePath('/admin/shift-types');
  return { success: true, message: 'Shift Type created successfully' };
}

export async function updateShiftType(id: string, prevState: ActionState, formData: FormData): Promise<ActionState> {
  const adminId = await getAdminIdFromToken();
  const validatedFields = createShiftTypeSchema.safeParse({
    name: formData.get('name'),
    startTime: formData.get('startTime'),
    endTime: formData.get('endTime'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Shift Type.',
      success: false,
    };
  }

  try {
    const { timesChanged, startTime, endTime } = await updateShiftTypeWithChangelog(
      id,
      validatedFields.data,
      adminId!
    );

    if (timesChanged) {
      // Run in background (fire and forget) to avoid blocking the response
      void updateFutureShifts(id, startTime, endTime);
    }
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: error instanceof Error ? error.message : 'Database Error: Failed to Update Shift Type.',
      success: false,
    };
  }

  revalidatePath('/admin/shift-types');
  return { success: true, message: 'Shift Type updated successfully' };
}

export async function deleteShiftType(id: string) {
  try {
    const adminId = await getAdminIdFromToken();
    await deleteShiftTypeWithChangelog(id, adminId!);
    revalidatePath('/admin/shift-types');
    return { success: true };
  } catch (error) {
    console.error('Database Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to delete shift type',
    };
  }
}
