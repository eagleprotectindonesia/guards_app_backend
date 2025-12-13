'use server';

import { prisma } from '@/lib/prisma';
import { createShiftTypeSchema } from '@/lib/validations';
import { revalidatePath } from 'next/cache';

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
    await prisma.shiftType.create({
      data: validatedFields.data,
    });
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
    await prisma.shiftType.update({
      where: { id },
      data: validatedFields.data,
    });
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to Update Shift Type.',
      success: false,
    };
  }

  revalidatePath('/admin/shift-types');
  return { success: true, message: 'Shift Type updated successfully' };
}

export async function deleteShiftType(id: string) {
  try {
    const relatedShifts = await prisma.shift.findFirst({
      where: { shiftTypeId: id },
    });

    if (relatedShifts) {
      return { success: false, message: 'Cannot delete shift type: It has associated shifts.' };
    }

    await prisma.shiftType.delete({
      where: { id },
    });
    revalidatePath('/admin/shift-types');
    return { success: true };
  } catch (error) {
    console.error('Database Error:', error);
    return { success: false, message: 'Failed to delete shift type' };
  }
}
