'use server';

import { prisma } from '@/lib/prisma';
import { createShiftSchema, CreateShiftInput, UpdateShiftInput } from '@/lib/validations';
import { revalidatePath } from 'next/cache';
import { parse, addDays, isBefore } from 'date-fns';
import { Prisma, ShiftStatus } from '@prisma/client';
import { getAdminIdFromToken } from '@/lib/admin-auth';
import { getActiveSites } from '@/lib/data-access/sites';
import { getActiveEmployeesSummary } from '@/lib/data-access/employees';
import {
  checkOverlappingShift,
  createShiftWithChangelog,
  updateShiftWithChangelog,
  deleteShiftWithChangelog,
  bulkCreateShiftsWithChangelog,
} from '@/lib/data-access/shifts';
import { getShiftTypeDurationInMins } from '@/lib/data-access/shift-types';
import { ActionState } from '@/types/actions';

export async function createShift(
  prevState: ActionState<CreateShiftInput>,
  formData: FormData
): Promise<ActionState<CreateShiftInput>> {
  const adminId = await getAdminIdFromToken();
  const validatedFields = createShiftSchema.safeParse({
    siteId: formData.get('siteId'),
    shiftTypeId: formData.get('shiftTypeId'),
    employeeId: formData.get('employeeId') || null, // Handle empty string as null
    date: formData.get('date'),
    requiredCheckinIntervalMins: Number(formData.get('requiredCheckinIntervalMins')),
    graceMinutes: Number(formData.get('graceMinutes')),
    note: formData.get('note') as string | null,
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Shift.',
      success: false,
    };
  }

  const { date, shiftTypeId, siteId, employeeId, requiredCheckinIntervalMins, graceMinutes, note } =
    validatedFields.data;

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

    const durationInMins = getShiftTypeDurationInMins(shiftType.startTime, shiftType.endTime);
    if (durationInMins % requiredCheckinIntervalMins !== 0) {
      return {
        message: `Shift duration (${durationInMins} mins) must be a multiple of the check-in interval (${requiredCheckinIntervalMins} mins).`,
        success: false,
      };
    }

    if (durationInMins < 2 * requiredCheckinIntervalMins) {
      return {
        message: `Shift duration (${durationInMins} mins) must allow for at least 2 check-in slots. Please reduce the check-in interval.`,
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
    if (employeeId) {
      const conflictingShift = await checkOverlappingShift({
        employeeId,
        startsAt: startDateTime,
        endsAt: endDateTime,
      });

      if (conflictingShift) {
        return {
          message: 'Employee already has a conflicting shift during this time.',
          success: false,
        };
      }
    }

    await createShiftWithChangelog(
      {
        site: { connect: { id: siteId } },
        shiftType: { connect: { id: shiftTypeId } },
        employee: employeeId ? { connect: { id: employeeId } } : undefined,
        date: dateObj,
        startsAt: startDateTime,
        endsAt: endDateTime,
        requiredCheckinIntervalMins,
        graceMinutes,
        note,
        status: 'scheduled',
      },
      adminId
    );
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

export async function updateShift(
  id: string,
  prevState: ActionState<UpdateShiftInput>,
  formData: FormData
): Promise<ActionState<UpdateShiftInput>> {
  const adminId = await getAdminIdFromToken();
  const validatedFields = createShiftSchema.safeParse({
    siteId: formData.get('siteId'),
    shiftTypeId: formData.get('shiftTypeId'),
    employeeId: formData.get('employeeId') || null,
    date: formData.get('date'),
    requiredCheckinIntervalMins: Number(formData.get('requiredCheckinIntervalMins')),
    graceMinutes: Number(formData.get('graceMinutes')),
    note: formData.get('note') as string | null,
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Shift.',
      success: false,
    };
  }

  const { date, shiftTypeId, siteId, employeeId, requiredCheckinIntervalMins, graceMinutes, note } =
    validatedFields.data;

  try {
    const shiftType = await prisma.shiftType.findUnique({
      where: { id: shiftTypeId },
    });

    if (!shiftType) {
      return { message: 'Selected Shift Type does not exist.', success: false };
    }

    const durationInMins = getShiftTypeDurationInMins(shiftType.startTime, shiftType.endTime);
    if (durationInMins % requiredCheckinIntervalMins !== 0) {
      return {
        message: `Shift duration (${durationInMins} mins) must be a multiple of the check-in interval (${requiredCheckinIntervalMins} mins).`,
        success: false,
      };
    }

    if (durationInMins < 2 * requiredCheckinIntervalMins) {
      return {
        message: `Shift duration (${durationInMins} mins) must allow for at least 2 check-in slots. Please reduce the check-in interval.`,
        success: false,
      };
    }

    const dateObj = new Date(`${date}T00:00:00Z`);
    const startDateTime = parse(`${date} ${shiftType.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
    let endDateTime = parse(`${date} ${shiftType.endTime}`, 'yyyy-MM-dd HH:mm', new Date());

    if (isBefore(endDateTime, startDateTime)) {
      endDateTime = addDays(endDateTime, 1);
    }

    // Check for overlapping shifts
    if (employeeId) {
      const conflictingShift = await checkOverlappingShift({
        employeeId,
        startsAt: startDateTime,
        endsAt: endDateTime,
        excludeShiftId: id,
      });

      if (conflictingShift) {
        return {
          message: 'Employee already has a conflicting shift during this time.',
          success: false,
        };
      }
    }

    await updateShiftWithChangelog(
      id,
      {
        site: { connect: { id: siteId } },
        shiftType: { connect: { id: shiftTypeId } },
        employee: employeeId ? { connect: { id: employeeId } } : { disconnect: true },
        date: dateObj,
        startsAt: startDateTime,
        endsAt: endDateTime,
        requiredCheckinIntervalMins,
        graceMinutes,
        note,
      },
      adminId
    );
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
    const adminId = await getAdminIdFromToken();
    await deleteShiftWithChangelog(id, adminId);
    revalidatePath('/admin/shifts');
    return { success: true };
  } catch (error) {
    console.error('Database Error:', error);
    return { success: false, message: 'Failed to delete shift' };
  }
}

export async function cancelShift(id: string, cancelNote?: string) {
  try {
    const adminId = await getAdminIdFromToken();

    // Validate that the shift exists and is in_progress
    const shift = await prisma.shift.findUnique({
      where: { id, deletedAt: null },
      select: { status: true, note: true },
    });

    if (!shift) {
      return { success: false, message: 'Shift not found' };
    }

    if (shift.status !== 'in_progress') {
      return { success: false, message: 'Only in-progress shifts can be cancelled' };
    }

    let updatedNote = shift.note;
    if (cancelNote?.trim()) {
      const timestamp = new Date().toLocaleString();
      const formattedCancelNote = `[Cancelled on ${timestamp}]: ${cancelNote.trim()}`;
      updatedNote = updatedNote ? `${formattedCancelNote}\n\n${updatedNote}` : formattedCancelNote;
    }

    await updateShiftWithChangelog(id, { status: ShiftStatus.cancelled, note: updatedNote }, adminId);
    revalidatePath('/admin/shifts');
    return { success: true };
  } catch (error) {
    console.error('Database Error:', error);
    return { success: false, message: 'Failed to cancel shift' };
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
  const [sites, shiftTypes, employees] = await Promise.all([
    getActiveSites(),
    prisma.shiftType.findMany({ select: { id: true, name: true, startTime: true, endTime: true } }),
    getActiveEmployeesSummary(),
  ]);

  const siteMap = new Map(sites.map(s => [s.name.toLowerCase(), s.id]));
  const shiftTypeMap = new Map(shiftTypes.map(st => [st.name.toLowerCase(), st]));
  const employeeMap = new Map(employees.map(g => [`${g.firstName} ${g.lastName}`.toLowerCase(), g.id]));

  const errors: string[] = [];
  const shiftsToCreate: Prisma.ShiftCreateManyInput[] = [];

  // Skip header row
  const startRow = 1;

  for (let i = startRow; i < lines.length; i++) {
    const line = lines[i];
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));

    if (cols.length < 6) {
      errors.push(
        `Row ${
          i + 1
        }: Insufficient columns. Expected at least 6 (Site Name, Shift Type Name, Date, Employee Name, Required Check-in Interval, Grace Period).`
      );
      continue;
    }

    const [siteName, shiftTypeName, dateStr, employeeName, intervalStr, graceStr] = cols;

    if (!siteName || !shiftTypeName || !dateStr || !employeeName || !intervalStr || !graceStr) {
      errors.push(
        `Row ${
          i + 1
        }: Missing required fields. Ensure Site Name, Shift Type Name, Date, Employee Name, Required Check-in Interval, and Grace Period are provided.`
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

    const employeeId = employeeName ? employeeMap.get(employeeName.toLowerCase()) || null : null;
    if (!employeeId && employeeName) {
      errors.push(`Row ${i + 1}: Employee with name '${employeeName}' not found or inactive.`);
    }

    // Validate Date
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateStr)) {
      errors.push(`Row ${i + 1}: Invalid date format '${dateStr}'. Expected YYYY-MM-DD.`);
    }

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
      (employeeId || employeeName === '') &&
      !isNaN(interval) &&
      interval > 0 &&
      !isNaN(grace) &&
      grace >= 0
    ) {
      const durationInMins = getShiftTypeDurationInMins(shiftType.startTime, shiftType.endTime);
      if (durationInMins % interval !== 0) {
        errors.push(
          `Row ${i + 1}: Shift duration (${durationInMins} mins) must be a multiple of the check-in interval (${interval} mins).`
        );
        continue;
      }

      if (durationInMins < 2 * interval) {
        errors.push(
          `Row ${i + 1}: Shift duration (${durationInMins} mins) must allow for at least 2 check-in slots. Please reduce the check-in interval.`
        );
        continue;
      }

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

      if (employeeId) {
        const overlapInBatch = shiftsToCreate.find(
          s => s.employeeId === employeeId && s.startsAt < endDateTime && s.endsAt > startDateTime
        );

        if (overlapInBatch) {
          errors.push(`Row ${i + 1}: Overlaps with another shift in this batch for employee ${employeeName}.`);
          continue;
        }

        const existingShift = await prisma.shift.findFirst({
          where: {
            employeeId,
            startsAt: { lt: endDateTime },
            endsAt: { gt: startDateTime },
          },
        });

        if (existingShift) {
          errors.push(`Row ${i + 1}: Employee ${employeeName} already has a shift overlapping with this time.`);
          continue;
        }
      }

      shiftsToCreate.push({
        siteId,
        shiftTypeId: shiftType.id,
        employeeId: employeeId || null,
        date: dateObj,
        startsAt: startDateTime,
        endsAt: endDateTime,
        status: 'scheduled',
        requiredCheckinIntervalMins: interval,
        graceMinutes: grace,
        createdById: adminId || null,
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
    await bulkCreateShiftsWithChangelog(shiftsToCreate, adminId);
    revalidatePath('/admin/shifts');
    return { success: true, message: `Successfully created ${shiftsToCreate.length} shifts.` };
  } catch (error) {
    console.error('Bulk Create Error:', error);
    return { success: false, message: 'Database error during bulk creation.' };
  }
}
