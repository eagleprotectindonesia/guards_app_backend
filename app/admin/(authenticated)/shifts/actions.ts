'use server';

import { prisma } from '@/lib/prisma';
import { createShiftSchema } from '@/lib/validations';
import { revalidatePath } from 'next/cache';
import { parse, addDays, isBefore } from 'date-fns';
import { Shift } from '@prisma/client';
import { getAdminIdFromToken } from '@/lib/admin-auth';

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
  const adminId = await getAdminIdFromToken();
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
    const dateObj = new Date(`${date}T00:00:00Z`);
    const startDateTime = parse(`${date} ${shiftType.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
    let endDateTime = parse(`${date} ${shiftType.endTime}`, 'yyyy-MM-dd HH:mm', new Date());

    // Handle overnight shift
    if (isBefore(endDateTime, startDateTime)) {
      endDateTime = addDays(endDateTime, 1);
    }

    if (isBefore(startDateTime, new Date())) {
      return {
        message: 'Cannot schedule a shift in the past.',
        success: false,
      };
    }

    // Check for overlapping shifts
    if (guardId) {
      const conflictingShift = await prisma.shift.findFirst({
        where: {
          guardId,
          startsAt: { lt: endDateTime },
          endsAt: { gt: startDateTime },
        },
      });

      if (conflictingShift) {
        return {
          message: 'Guard already has a conflicting shift during this time.',
          success: false,
        };
      }
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
        createdBy: adminId,
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

    const dateObj = new Date(`${date}T00:00:00Z`);
    const startDateTime = parse(`${date} ${shiftType.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
    let endDateTime = parse(`${date} ${shiftType.endTime}`, 'yyyy-MM-dd HH:mm', new Date());

    if (isBefore(endDateTime, startDateTime)) {
      endDateTime = addDays(endDateTime, 1);
    }

    // Check for overlapping shifts
    if (guardId) {
      const conflictingShift = await prisma.shift.findFirst({
        where: {
          guardId,
          id: { not: id },
          startsAt: { lt: endDateTime },
          endsAt: { gt: startDateTime },
        },
      });

      if (conflictingShift) {
        return {
          message: 'Guard already has a conflicting shift during this time.',
          success: false,
        };
      }
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
    await prisma.$transaction([
      prisma.alert.deleteMany({
        where: { shiftId: id },
      }),
      prisma.checkin.deleteMany({
        where: { shiftId: id },
      }),
      prisma.attendance.deleteMany({
        where: { shiftId: id },
      }),
      prisma.shift.delete({
        where: { id },
      }),
    ]);
    revalidatePath('/admin/shifts');
    return { success: true };
  } catch (error) {
    console.error('Database Error:', error);
    return { success: false, message: 'Failed to delete shift' };
  }
}

export async function bulkCreateShifts(
  formData: FormData
): Promise<{ success: boolean; message?: string; errors?: string[] }> {
  const adminId = await getAdminIdFromToken();
  const file = formData.get('file') as File;
  if (!file) {
    return { success: false, message: 'No file provided.' };
  }

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');

  if (lines.length < 2) {
    return { success: false, message: 'CSV file is empty or missing data.' };
  }

  // Fetch all reference data for lookups
  const [sites, shiftTypes, guards] = await Promise.all([
    prisma.site.findMany({ select: { id: true, name: true } }),
    prisma.shiftType.findMany({ select: { id: true, name: true, startTime: true, endTime: true } }),
    prisma.guard.findMany({
      where: { status: true },
      select: { id: true, name: true }, // Changed from guardCode to name
    }),
  ]);

  const siteMap = new Map(sites.map(s => [s.name.toLowerCase(), s.id]));
  const shiftTypeMap = new Map(shiftTypes.map(st => [st.name.toLowerCase(), st]));
  const guardMap = new Map(guards.map(g => [g.name.toLowerCase(), g.id])); // Changed to use name instead of code

  const errors: string[] = [];
  const shiftsToCreate: Pick<
    Shift,
    | 'siteId'
    | 'shiftTypeId'
    | 'guardId'
    | 'date'
    | 'requiredCheckinIntervalMins'
    | 'graceMinutes'
    | 'startsAt'
    | 'endsAt'
    | 'status'
    | 'createdBy'
  >[] = [];

  // Skip header row
  const startRow = 1;

  for (let i = startRow; i < lines.length; i++) {
    const line = lines[i];
    // Simple CSV split, handling potential quotes if needed?
    // For now, assume simple comma separation as per prompt requirements of "csv input" usually implying standard or simple csv.
    // If we wanted to be robust against commas in names, we'd need a parser.
    // Given previous context, let's try to handle basic quotes if possible, or just split.
    // Splitting by comma is risky if names have commas. But names are usually "Site A", "Morning Shift".
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));

    // Expected: Site Name, Shift Type Name, Date, Guard Name, Required Check-in Interval (minutes), Grace Period (minutes)
    if (cols.length < 6) {
      errors.push(
        `Row ${
          i + 1
        }: Insufficient columns. Expected at least 6 (Site Name, Shift Type Name, Date, Guard Name, Required Check-in Interval, Grace Period).`
      );
      continue;
    }

    const [siteName, shiftTypeName, dateStr, guardName, intervalStr, graceStr] = cols;

    if (!siteName || !shiftTypeName || !dateStr || !guardName || !intervalStr || !graceStr) {
      errors.push(
        `Row ${
          i + 1
        }: Missing required fields. Ensure Site Name, Shift Type Name, Date, Guard Name, Required Check-in Interval, and Grace Period are provided.`
      );
      continue;
    }

    const siteId = siteMap.get(siteName.toLowerCase());
    if (!siteId) {
      errors.push(`Row ${i + 1}: Site '${siteName}' not found.`);
    }

    const shiftType = shiftTypeMap.get(shiftTypeName.toLowerCase());
    if (!shiftType) {
      errors.push(`Row ${i + 1}: Shift Type '${shiftTypeName}' not found.`);
    }

    const guardId = guardName ? guardMap.get(guardName.toLowerCase()) || null : null;
    if (!guardId && guardName) {
      // Only show error if a guard name was provided but not found
      errors.push(`Row ${i + 1}: Guard with name '${guardName}' not found or inactive.`);
    }

    // Validate Date
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateStr)) {
      errors.push(`Row ${i + 1}: Invalid date format '${dateStr}'. Expected YYYY-MM-DD.`);
    }

    // Validate interval and grace minutes
    const interval = parseInt(intervalStr, 10);
    const grace = parseInt(graceStr, 10);

    if (isNaN(interval) || interval <= 0) {
      errors.push(`Row ${i + 1}: Invalid Required Check-in Interval '${intervalStr}'. Must be a positive integer.`);
    }

    if (isNaN(grace) || grace < 0) {
      errors.push(`Row ${i + 1}: Invalid Grace Period '${graceStr}'. Must be a non-negative integer.`);
    }

    if (
      siteId &&
      shiftType &&
      dateRegex.test(dateStr) &&
      (guardId || guardName === '') &&
      !isNaN(interval) &&
      interval > 0 &&
      !isNaN(grace) &&
      grace >= 0
    ) {
      // guardId is now optional (can be null)
      // Prepare data
      const dateObj = new Date(`${dateStr}T00:00:00Z`);
      const startDateTime = parse(`${dateStr} ${shiftType.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
      let endDateTime = parse(`${dateStr} ${shiftType.endTime}`, 'yyyy-MM-dd HH:mm', new Date());

      if (isBefore(endDateTime, startDateTime)) {
        endDateTime = addDays(endDateTime, 1);
      }

      if (isBefore(startDateTime, new Date())) {
        errors.push(`Row ${i + 1}: Cannot schedule a shift in the past.`);
        continue;
      }

      // Check intra-batch overlap
      if (guardId) {
        const overlapInBatch = shiftsToCreate.find(
          s => s.guardId === guardId && s.startsAt < endDateTime && s.endsAt > startDateTime
        );

        if (overlapInBatch) {
          errors.push(`Row ${i + 1}: Overlaps with another shift in this batch for guard ${guardName}.`);
          continue;
        }

        // Check DB overlap
        const existingShift = await prisma.shift.findFirst({
          where: {
            guardId,
            startsAt: { lt: endDateTime },
            endsAt: { gt: startDateTime },
          },
        });

        if (existingShift) {
          errors.push(`Row ${i + 1}: Guard ${guardName} already has a shift overlapping with this time.`);
          continue;
        }
      }

      shiftsToCreate.push({
        siteId,
        shiftTypeId: shiftType.id,
        guardId: guardId || null, // Allow null for unassigned shifts
        date: dateObj,
        startsAt: startDateTime,
        endsAt: endDateTime,
        status: 'scheduled',
        requiredCheckinIntervalMins: interval,
        graceMinutes: grace,
        createdBy: adminId || null,
      });
    }
  }

  if (errors.length > 0) {
    return { success: false, message: 'Validation failed.', errors };
  }

  if (shiftsToCreate.length === 0) {
    return { success: false, message: 'No valid shifts found to create.' };
  }

  try {
    await prisma.shift.createMany({
      data: shiftsToCreate,
    });
    revalidatePath('/admin/shifts');
    return { success: true, message: `Successfully created ${shiftsToCreate.length} shifts.` };
  } catch (error) {
    console.error('Bulk Create Error:', error);
    return { success: false, message: 'Database error during bulk creation.' };
  }
}
