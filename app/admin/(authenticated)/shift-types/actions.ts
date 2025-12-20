'use server';

import { prisma } from '@/lib/prisma';
import { createShiftTypeSchema } from '@/lib/validations';
import { revalidatePath } from 'next/cache';
import { parse, addDays, isBefore } from 'date-fns';

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

  const { name, startTime, endTime } = validatedFields.data;

  try {
    // Fetch existing shift type to check for changes
    const existingShiftType = await prisma.shiftType.findUnique({
      where: { id },
    });

    if (!existingShiftType) {
      return {
        message: 'Shift Type not found.',
        success: false,
      };
    }

    const timesChanged = existingShiftType.startTime !== startTime || existingShiftType.endTime !== endTime;

    await prisma.shiftType.update({
      where: { id },
      data: { name, startTime, endTime },
    });

    if (timesChanged) {
      // Run in background (fire and forget) to avoid blocking the response
      void (async () => {
        try {
          // Find all unstarted future shifts
          const futureShifts = await prisma.shift.findMany({
            where: {
              shiftTypeId: id,
              status: 'scheduled',
              startsAt: {
                gt: new Date(),
              },
            },
          });

          // Update shifts in parallel
          await Promise.all(
            futureShifts.map(async (shift) => {
              // Reconstruct date string from shift.date (assuming stored as UTC midnight or similar consistent date)
              // We use toISOString().split('T')[0] to get YYYY-MM-DD
              const dateStr = shift.date.toISOString().split('T')[0];

              // Parse new start/end times using the shift's date
              const startDateTime = parse(`${dateStr} ${startTime}`, 'yyyy-MM-dd HH:mm', new Date());
              let endDateTime = parse(`${dateStr} ${endTime}`, 'yyyy-MM-dd HH:mm', new Date());

              // Handle overnight shift
              if (isBefore(endDateTime, startDateTime)) {
                endDateTime = addDays(endDateTime, 1);
              }

              await prisma.shift.update({
                where: { id: shift.id },
                data: {
                  startsAt: startDateTime,
                  endsAt: endDateTime,
                },
              });
            })
          );
          console.log(`[Background] Updated ${futureShifts.length} future shifts for ShiftType ${id}`);
        } catch (backgroundError) {
          console.error('[Background] Failed to update future shifts:', backgroundError);
        }
      })();
    }
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
