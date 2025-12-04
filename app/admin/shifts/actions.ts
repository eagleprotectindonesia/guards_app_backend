'use server';

import { prisma } from '@/lib/prisma';
import { createShiftSchema } from '@/lib/validations';
import { revalidatePath } from 'next/cache';
import { parse, addDays, isBefore } from 'date-fns';

export type ActionState = {
  message?: string;
  errors?: {
    siteId?: string[];
    shiftTypeId?: string[];
    guardId?: string[];
    date?: string[];
    requiredCheckinIntervalMins?: string[];
    graceMinutes?: string[];
  };
  success?: boolean;
};

export async function createShift(prevState: ActionState, formData: FormData): Promise<ActionState> {
  const validatedFields = createShiftSchema.safeParse({
    siteId: formData.get('siteId'),
    shiftTypeId: formData.get('shiftTypeId'),
    guardId: formData.get('guardId') || null, // Handle empty string as null
    date: formData.get('date'),
    requiredCheckinIntervalMins: Number(formData.get('requiredCheckinIntervalMins')),
    graceMinutes: Number(formData.get('graceMinutes')),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Shift.',
      success: false,
    };
  }

  const { date, shiftTypeId, siteId, guardId, requiredCheckinIntervalMins, graceMinutes } = validatedFields.data;

  try {
    // Fetch ShiftType to calculate startsAt and endsAt
    const shiftType = await prisma.shiftType.findUnique({
      where: { id: shiftTypeId },
    });

    if (!shiftType) {
      return {
        message: 'Selected Shift Type does not exist.',
        success: false,
      };
    }

    // Parse times
    // date is YYYY-MM-DD
    // startTime/endTime is HH:mm
    const dateObj = parse(date, 'yyyy-MM-dd', new Date());
    const startDateTime = parse(`${date} ${shiftType.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
    let endDateTime = parse(`${date} ${shiftType.endTime}`, 'yyyy-MM-dd HH:mm', new Date());

    // Handle overnight shift
    if (isBefore(endDateTime, startDateTime)) {
      endDateTime = addDays(endDateTime, 1);
    }

    await prisma.shift.create({
      data: {
        siteId,
        shiftTypeId,
        guardId: guardId || null,
        date: dateObj,
        startsAt: startDateTime,
        endsAt: endDateTime,
        requiredCheckinIntervalMins,
        graceMinutes,
        status: 'scheduled',
      },
    });
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to Create Shift.',
      success: false,
    };
  }

  revalidatePath('/admin/shifts');
  return { success: true, message: 'Shift created successfully' };
}

export async function updateShift(id: string, prevState: ActionState, formData: FormData): Promise<ActionState> {
  // Similar logic, but we might need to recalculate times if shiftType or date changes.
  // For simplicity, we'll assume we recalculate if fields are present.
  
  const validatedFields = createShiftSchema.safeParse({
    siteId: formData.get('siteId'),
    shiftTypeId: formData.get('shiftTypeId'),
    guardId: formData.get('guardId') || null,
    date: formData.get('date'),
    requiredCheckinIntervalMins: Number(formData.get('requiredCheckinIntervalMins')),
    graceMinutes: Number(formData.get('graceMinutes')),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Shift.',
      success: false,
    };
  }

  const { date, shiftTypeId, siteId, guardId, requiredCheckinIntervalMins, graceMinutes } = validatedFields.data;

  try {
    const shiftType = await prisma.shiftType.findUnique({
      where: { id: shiftTypeId },
    });

    if (!shiftType) {
      return { message: 'Selected Shift Type does not exist.', success: false };
    }

    const dateObj = parse(date, 'yyyy-MM-dd', new Date());
    const startDateTime = parse(`${date} ${shiftType.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
    let endDateTime = parse(`${date} ${shiftType.endTime}`, 'yyyy-MM-dd HH:mm', new Date());

    if (isBefore(endDateTime, startDateTime)) {
      endDateTime = addDays(endDateTime, 1);
    }

    await prisma.shift.update({
      where: { id },
      data: {
        siteId,
        shiftTypeId,
        guardId: guardId || null,
        date: dateObj,
        startsAt: startDateTime,
        endsAt: endDateTime,
        requiredCheckinIntervalMins,
        graceMinutes,
      },
    });
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to Update Shift.',
      success: false,
    };
  }

  revalidatePath('/admin/shifts');
  return { success: true, message: 'Shift updated successfully' };
}

export async function deleteShift(id: string) {
  try {
    await prisma.shift.delete({
      where: { id },
    });
    revalidatePath('/admin/shifts');
    return { success: true };
  } catch (error) {
    console.error('Database Error:', error);
    return { success: false, message: 'Failed to delete shift' };
  }
}
