'use server';

import { prisma } from '@repo/database';
import { revalidatePath } from 'next/cache';
import { addDays, isBefore, parse } from 'date-fns';
import { ShiftStatus } from '@prisma/client';
import { getAdminIdFromToken } from '@/lib/admin-auth';
import {
  bulkCreateOfficeShiftsWithChangelog,
  checkOverlappingOfficeShift,
  createOfficeShiftWithChangelog,
  deleteOfficeShiftWithChangelog,
  getShiftTypeDurationInMins,
  updateOfficeShiftWithChangelog,
} from '@repo/database';
import { ActionState } from '@/types/actions';
import {
  createOfficeShiftSchema,
  CreateOfficeShiftInput,
  UpdateOfficeShiftInput,
} from '@repo/validations';

const BULK_OFFICE_SHIFT_HEADERS = ['employee_code', 'shift_type_name', 'date', 'grace_minutes', 'note'] as const;

function parseCsvLine(line: string) {
  return line.split(',').map(value => value.trim().replace(/^"|"$/g, ''));
}

function revalidateOfficeShiftPaths() {
  revalidatePath('/admin/office-shifts');
  revalidatePath('/admin/employees');
}

export async function createOfficeShift(
  prevState: ActionState<CreateOfficeShiftInput>,
  formData: FormData
): Promise<ActionState<CreateOfficeShiftInput>> {
  const adminId = await getAdminIdFromToken();
  const validatedFields = createOfficeShiftSchema.safeParse({
    officeShiftTypeId: formData.get('officeShiftTypeId'),
    employeeId: formData.get('employeeId'),
    date: formData.get('date'),
    graceMinutes: Number(formData.get('graceMinutes')),
    note: formData.get('note') as string | null,
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Office Shift.',
      success: false,
    };
  }

  const { officeShiftTypeId, employeeId, date, graceMinutes, note } = validatedFields.data;

  try {
    const [officeShiftType, employee] = await Promise.all([
      prisma.officeShiftType.findUnique({ where: { id: officeShiftTypeId, deletedAt: null } }),
      prisma.employee.findUnique({
        where: { id: employeeId, deletedAt: null },
        select: { id: true, role: true, officeAttendanceMode: true },
      }),
    ]);

    if (!officeShiftType) {
      return { success: false, message: 'Selected Office Shift Type does not exist.' };
    }

    if (!employee || employee.role !== 'office' || employee.officeAttendanceMode !== 'shift_based') {
      return { success: false, message: 'Selected employee is not eligible for office shifts.' };
    }

    const dateObj = new Date(`${date}T00:00:00Z`);
    const startDateTime = parse(`${date} ${officeShiftType.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
    let endDateTime = parse(`${date} ${officeShiftType.endTime}`, 'yyyy-MM-dd HH:mm', new Date());
    if (isBefore(endDateTime, startDateTime)) {
      endDateTime = addDays(endDateTime, 1);
    }

    if (isBefore(startDateTime, new Date())) {
      return { success: false, message: 'Cannot schedule an office shift in the past.' };
    }

    const conflictingShift = await checkOverlappingOfficeShift({
      employeeId,
      startsAt: startDateTime,
      endsAt: endDateTime,
    });

    if (conflictingShift) {
      return { success: false, message: 'Employee already has a conflicting office shift during this time.' };
    }

    await createOfficeShiftWithChangelog(
      {
        officeShiftType: { connect: { id: officeShiftTypeId } },
        employee: { connect: { id: employeeId } },
        date: dateObj,
        startsAt: startDateTime,
        endsAt: endDateTime,
        graceMinutes,
        note,
        status: 'scheduled',
      },
      adminId!
    );
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: error instanceof Error ? error.message : 'Database Error: Failed to Create Office Shift.',
      success: false,
    };
  }

  revalidateOfficeShiftPaths();
  return { success: true, message: 'Office Shift created successfully' };
}

export async function updateOfficeShift(
  id: string,
  prevState: ActionState<UpdateOfficeShiftInput>,
  formData: FormData
): Promise<ActionState<UpdateOfficeShiftInput>> {
  const adminId = await getAdminIdFromToken();
  const validatedFields = createOfficeShiftSchema.safeParse({
    officeShiftTypeId: formData.get('officeShiftTypeId'),
    employeeId: formData.get('employeeId'),
    date: formData.get('date'),
    graceMinutes: Number(formData.get('graceMinutes')),
    note: formData.get('note') as string | null,
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Office Shift.',
      success: false,
    };
  }

  const { officeShiftTypeId, employeeId, date, graceMinutes, note } = validatedFields.data;

  try {
    const [officeShiftType, employee] = await Promise.all([
      prisma.officeShiftType.findUnique({ where: { id: officeShiftTypeId, deletedAt: null } }),
      prisma.employee.findUnique({
        where: { id: employeeId, deletedAt: null },
        select: { id: true, role: true, officeAttendanceMode: true },
      }),
    ]);

    if (!officeShiftType) {
      return { success: false, message: 'Selected Office Shift Type does not exist.' };
    }

    if (!employee || employee.role !== 'office' || employee.officeAttendanceMode !== 'shift_based') {
      return { success: false, message: 'Selected employee is not eligible for office shifts.' };
    }

    const dateObj = new Date(`${date}T00:00:00Z`);
    const startDateTime = parse(`${date} ${officeShiftType.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
    let endDateTime = parse(`${date} ${officeShiftType.endTime}`, 'yyyy-MM-dd HH:mm', new Date());
    if (isBefore(endDateTime, startDateTime)) {
      endDateTime = addDays(endDateTime, 1);
    }

    const conflictingShift = await checkOverlappingOfficeShift({
      employeeId,
      startsAt: startDateTime,
      endsAt: endDateTime,
      excludeOfficeShiftId: id,
    });

    if (conflictingShift) {
      return { success: false, message: 'Employee already has a conflicting office shift during this time.' };
    }

    await updateOfficeShiftWithChangelog(
      id,
      {
        officeShiftType: { connect: { id: officeShiftTypeId } },
        employee: { connect: { id: employeeId } },
        date: dateObj,
        startsAt: startDateTime,
        endsAt: endDateTime,
        graceMinutes,
        note,
      },
      adminId!
    );
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: error instanceof Error ? error.message : 'Database Error: Failed to Update Office Shift.',
      success: false,
    };
  }

  revalidateOfficeShiftPaths();
  return { success: true, message: 'Office Shift updated successfully' };
}

export async function deleteOfficeShift(id: string) {
  try {
    const adminId = await getAdminIdFromToken();
    await deleteOfficeShiftWithChangelog(id, adminId!);
    revalidateOfficeShiftPaths();
    return { success: true };
  } catch (error) {
    console.error('Database Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to delete office shift',
    };
  }
}

export async function cancelOfficeShift(id: string, cancelNote?: string) {
  try {
    const adminId = await getAdminIdFromToken();
    const officeShift = await prisma.officeShift.findUnique({
      where: { id, deletedAt: null },
      select: { status: true, note: true },
    });

    if (!officeShift) {
      return { success: false, message: 'Office Shift not found' };
    }

    if (officeShift.status !== 'in_progress') {
      return { success: false, message: 'Only in-progress office shifts can be cancelled' };
    }

    let updatedNote = officeShift.note;
    if (cancelNote?.trim()) {
      const timestamp = new Date().toLocaleString();
      const formattedCancelNote = `[Cancelled on ${timestamp}]: ${cancelNote.trim()}`;
      updatedNote = updatedNote ? `${formattedCancelNote}\n\n${updatedNote}` : formattedCancelNote;
    }

    await updateOfficeShiftWithChangelog(id, { status: ShiftStatus.cancelled, note: updatedNote }, adminId!);
    revalidateOfficeShiftPaths();
    return { success: true };
  } catch (error) {
    console.error('Database Error:', error);
    return { success: false, message: 'Failed to cancel office shift' };
  }
}

export async function bulkCreateOfficeShifts(
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

  const header = parseCsvLine(lines[0]).map(value => value.toLowerCase());
  if (header.length < BULK_OFFICE_SHIFT_HEADERS.length || !BULK_OFFICE_SHIFT_HEADERS.every((value, index) => header[index] === value)) {
    return {
      success: false,
      message: `Invalid CSV header. Expected: ${BULK_OFFICE_SHIFT_HEADERS.join(', ')}`,
    };
  }

  const [officeShiftTypes, employees] = await Promise.all([
    prisma.officeShiftType.findMany({ where: { deletedAt: null }, select: { id: true, name: true, startTime: true, endTime: true } }),
    prisma.employee.findMany({
      where: {
        status: true,
        deletedAt: null,
        role: 'office',
        officeAttendanceMode: 'shift_based',
      },
      select: {
        id: true,
        fullName: true,
        employeeNumber: true,
      },
    }),
  ]);

  const officeShiftTypeMap = new Map(officeShiftTypes.map(item => [item.name.toLowerCase(), item]));
  const employeeMap = new Map(
    employees
      .filter(employee => employee.employeeNumber)
      .map(employee => [employee.employeeNumber!.toLowerCase(), employee])
  );

  const errors: string[] = [];
  const officeShiftsToCreate: Parameters<typeof bulkCreateOfficeShiftsWithChangelog>[0] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < BULK_OFFICE_SHIFT_HEADERS.length) {
      errors.push(`Row ${i + 1}: Missing required columns.`);
      continue;
    }

    const [employeeCode, shiftTypeName, dateStr, graceStr, note = ''] = cols;
    if (!employeeCode || !shiftTypeName || !dateStr || !graceStr) {
      errors.push(`Row ${i + 1}: employee_code, shift_type_name, date, and grace_minutes are required.`);
      continue;
    }

    const employee = employeeMap.get(employeeCode.toLowerCase());
    if (!employee) {
      errors.push(`Row ${i + 1}: Employee '${employeeCode}' not found or is not shift-based office staff.`);
      continue;
    }

    const officeShiftType = officeShiftTypeMap.get(shiftTypeName.toLowerCase());
    if (!officeShiftType) {
      errors.push(`Row ${i + 1}: Office Shift Type '${shiftTypeName}' not found.`);
      continue;
    }

    const graceMinutes = Number(graceStr);
    if (!Number.isInteger(graceMinutes) || graceMinutes < 1) {
      errors.push(`Row ${i + 1}: grace_minutes must be a positive integer.`);
      continue;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      errors.push(`Row ${i + 1}: date must be in YYYY-MM-DD format.`);
      continue;
    }

    const durationInMins = getShiftTypeDurationInMins(officeShiftType.startTime, officeShiftType.endTime);
    if (durationInMins <= 0) {
      errors.push(`Row ${i + 1}: Office Shift Type '${shiftTypeName}' has an invalid duration.`);
      continue;
    }

    const dateObj = new Date(`${dateStr}T00:00:00Z`);
    const startDateTime = parse(`${dateStr} ${officeShiftType.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
    let endDateTime = parse(`${dateStr} ${officeShiftType.endTime}`, 'yyyy-MM-dd HH:mm', new Date());
    if (isBefore(endDateTime, startDateTime)) {
      endDateTime = addDays(endDateTime, 1);
    }

    if (isBefore(startDateTime, new Date())) {
      errors.push(`Row ${i + 1}: Cannot create office shift in the past.`);
      continue;
    }

    const overlapInBatch = officeShiftsToCreate.find(shift =>
      shift.employeeId === employee.id &&
      shift.startsAt < endDateTime &&
      shift.endsAt > startDateTime
    );
    if (overlapInBatch) {
      errors.push(`Row ${i + 1}: Conflicts with another office shift in this upload for employee '${employeeCode}'.`);
      continue;
    }

    const conflictingShift = await checkOverlappingOfficeShift({
      employeeId: employee.id,
      startsAt: startDateTime,
      endsAt: endDateTime,
    });
    if (conflictingShift) {
      errors.push(`Row ${i + 1}: Employee '${employeeCode}' already has a conflicting office shift.`);
      continue;
    }

    officeShiftsToCreate.push({
      officeShiftTypeId: officeShiftType.id,
      employeeId: employee.id,
      date: dateObj,
      startsAt: startDateTime,
      endsAt: endDateTime,
      graceMinutes,
      note: note || null,
      status: 'scheduled',
    });
  }

  if (errors.length > 0) {
    return { success: false, message: 'Validation failed for one or more rows.', errors };
  }

  if (officeShiftsToCreate.length === 0) {
    return { success: false, message: 'No valid office shifts found to create.' };
  }

  try {
    await bulkCreateOfficeShiftsWithChangelog(officeShiftsToCreate, adminId!);
    revalidateOfficeShiftPaths();
    return { success: true, message: `Successfully created ${officeShiftsToCreate.length} office shifts.` };
  } catch (error) {
    console.error('Database Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Database Error: Failed to create office shifts.',
    };
  }
}
