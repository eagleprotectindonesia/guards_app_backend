'use server';

import {
  createOfficeShiftTypeWithChangelog,
  deleteOfficeShiftTypeWithChangelog,
  updateFutureOfficeShifts,
  updateOfficeShiftTypeWithChangelog,
} from '@repo/database';
import {
  createOfficeShiftTypeSchema,
  CreateOfficeShiftTypeInput,
  UpdateOfficeShiftTypeInput,
} from '@repo/validations';
import { revalidatePath } from 'next/cache';
import { getAdminIdFromToken } from '@/lib/admin-auth';
import { ActionState } from '@/types/actions';

export async function createOfficeShiftType(
  prevState: ActionState<CreateOfficeShiftTypeInput>,
  formData: FormData
): Promise<ActionState<CreateOfficeShiftTypeInput>> {
  const adminId = await getAdminIdFromToken();
  const validatedFields = createOfficeShiftTypeSchema.safeParse({
    name: formData.get('name'),
    startTime: formData.get('startTime'),
    endTime: formData.get('endTime'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Office Shift Type.',
      success: false,
    };
  }

  try {
    await createOfficeShiftTypeWithChangelog(validatedFields.data, adminId!);
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: error instanceof Error ? error.message : 'Database Error: Failed to Create Office Shift Type.',
      success: false,
    };
  }

  revalidatePath('/admin/office-shift-types');
  revalidatePath('/admin/office-shifts', 'layout');
  return { success: true, message: 'Office Shift Type created successfully' };
}

export async function updateOfficeShiftType(
  id: string,
  prevState: ActionState<UpdateOfficeShiftTypeInput>,
  formData: FormData
): Promise<ActionState<UpdateOfficeShiftTypeInput>> {
  const adminId = await getAdminIdFromToken();
  const validatedFields = createOfficeShiftTypeSchema.safeParse({
    name: formData.get('name'),
    startTime: formData.get('startTime'),
    endTime: formData.get('endTime'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Office Shift Type.',
      success: false,
    };
  }

  try {
    const { timesChanged, startTime, endTime } = await updateOfficeShiftTypeWithChangelog(
      id,
      validatedFields.data,
      adminId!
    );

    if (timesChanged) {
      void updateFutureOfficeShifts(id, startTime, endTime);
    }
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: error instanceof Error ? error.message : 'Database Error: Failed to Update Office Shift Type.',
      success: false,
    };
  }

  revalidatePath('/admin/office-shift-types');
  revalidatePath('/admin/office-shifts', 'layout');
  return { success: true, message: 'Office Shift Type updated successfully' };
}

export async function deleteOfficeShiftType(id: string, options?: { force?: boolean }) {
  try {
    const adminId = await getAdminIdFromToken();
    await deleteOfficeShiftTypeWithChangelog(id, adminId!, options);
    revalidatePath('/admin/office-shift-types');
    revalidatePath('/admin/office-shifts', 'layout');
    return { success: true };
  } catch (error) {
    console.error('Database Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to delete office shift type',
    };
  }
}
