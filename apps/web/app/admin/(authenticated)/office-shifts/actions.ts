'use server';

import { prisma } from '@repo/database';
import { revalidatePath } from 'next/cache';
import { addDays, isBefore, parse, eachDayOfInterval, format } from 'date-fns';
import { ShiftStatus } from '@prisma/client';
import { getAdminIdFromToken } from '@/lib/admin-auth';
import {
  bulkCreateOfficeShiftsWithChangelog,
  checkOverlappingOfficeShift,
  createOfficeShiftWithChangelog,
  deleteOfficeShiftWithChangelog,
  getShiftTypeDurationInMins,
  updateOfficeShiftWithChangelog,
  getOfficeEmployeesByCodes,
} from '@repo/database';
import { ActionState } from '@/types/actions';
import { createOfficeShiftSchema, CreateOfficeShiftInput, UpdateOfficeShiftInput } from '@repo/validations';

const BULK_OFFICE_SHIFT_HEADERS = ['employee_code', 'shift_type_name', 'date', 'note'] as const;

interface ParsedCSVRow {
  employeeCode: string;
  shiftTypeName: string;
  date: string;
  note?: string;
}

interface ShiftPreviewData {
  date: string;
  shiftTypeName: string;
  startTime: string;
  endTime: string;
  note?: string | null;
  isDayOff: boolean;
  error?: string;
}

interface EmployeePreviewData {
  employeeCode: string;
  employeeName: string;
  employeeId: string;
  firstDate: string;
  lastDate: string;
  totalShifts: number;
  shifts: ShiftPreviewData[];
}

interface OfficeShiftPreviewResult {
  success: boolean;
  message?: string;
  errors?: string[];
  preview?: {
    employees: EmployeePreviewData[];
    totalShiftsToCreate: number;
    totalEmployees: number;
    dateRange: {
      start: string;
      end: string;
    };
  };
}

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
    note: formData.get('note') as string | null,
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Office Shift.',
      success: false,
    };
  }

  const { officeShiftTypeId, employeeId, date, note } = validatedFields.data;

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
    note: formData.get('note') as string | null,
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Office Shift.',
      success: false,
    };
  }

  const { officeShiftTypeId, employeeId, date, note } = validatedFields.data;

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

export async function parseAndValidateOfficeShiftsCSV(formData: FormData): Promise<OfficeShiftPreviewResult> {
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
  if (
    header.length < BULK_OFFICE_SHIFT_HEADERS.length ||
    !BULK_OFFICE_SHIFT_HEADERS.every((value, index) => header[index] === value)
  ) {
    return {
      success: false,
      message: `Invalid CSV header. Expected: ${BULK_OFFICE_SHIFT_HEADERS.join(', ')}`,
    };
  }

  // Parse all CSV rows first
  const parsedRows: ParsedCSVRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < BULK_OFFICE_SHIFT_HEADERS.length) {
      errors.push(`Row ${i + 1}: Missing required columns.`);
      continue;
    }

    const [employeeCode, shiftTypeName, dateStr, note = ''] = cols;
    if (!employeeCode || !shiftTypeName || !dateStr) {
      errors.push(`Row ${i + 1}: employee_code, shift_type_name, and date are required.`);
      continue;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      errors.push(`Row ${i + 1}: date must be in YYYY-MM-DD format.`);
      continue;
    }

    parsedRows.push({ employeeCode, shiftTypeName, date: dateStr, note });
  }

  if (errors.length > 0) {
    return { success: false, message: 'Validation failed for one or more rows.', errors };
  }

  if (parsedRows.length === 0) {
    return { success: false, message: 'No valid office shifts found to create.' };
  }

  // Get unique employee codes and fetch employee data
  const uniqueEmployeeCodes = Array.from(new Set(parsedRows.map(row => row.employeeCode)));
  const employees = await getOfficeEmployeesByCodes(uniqueEmployeeCodes);
  const employeeMap = new Map(employees.map(emp => [emp.employeeNumber.toLowerCase(), emp]));

  console.log(uniqueEmployeeCodes);
  // Validate employees exist
  for (const row of parsedRows) {
    const employee = employeeMap.get(row.employeeCode.toLowerCase());
    if (!employee) {
      errors.push(`Employee '${row.employeeCode}' not found or is not shift-based office staff.`);
    }
  }

  if (errors.length > 0) {
    return { success: false, message: 'Validation failed for one or more rows.', errors };
  }

  // Get shift types
  const officeShiftTypes = await prisma.officeShiftType.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, startTime: true, endTime: true },
  });
  const shiftTypeMap = new Map(officeShiftTypes.map(item => [item.name.toLowerCase(), item]));

  // Validate shift types
  for (const row of parsedRows) {
    const shiftType = shiftTypeMap.get(row.shiftTypeName.toLowerCase());
    if (!shiftType) {
      errors.push(`Office Shift Type '${row.shiftTypeName}' not found.`);
      continue;
    }

    const durationInMins = getShiftTypeDurationInMins(shiftType.startTime, shiftType.endTime);
    if (durationInMins <= 0) {
      errors.push(`Office Shift Type '${row.shiftTypeName}' has an invalid duration.`);
    }
  }

  if (errors.length > 0) {
    return { success: false, message: 'Validation failed for one or more rows.', errors };
  }

  // Group rows by employee
  const rowsByEmployee = new Map<string, ParsedCSVRow[]>();
  for (const row of parsedRows) {
    const employee = employeeMap.get(row.employeeCode.toLowerCase())!;
    const key = employee.id;
    if (!rowsByEmployee.has(key)) {
      rowsByEmployee.set(key, []);
    }
    rowsByEmployee.get(key)!.push(row);
  }

  // First pass: calculate GLOBAL date range across all employees
  let overallMinDate: string | null = null;
  let overallMaxDate: string | null = null;
  for (const rows of rowsByEmployee.values()) {
    for (const row of rows) {
      if (!overallMinDate || row.date < overallMinDate) overallMinDate = row.date;
      if (!overallMaxDate || row.date > overallMaxDate) overallMaxDate = row.date;
    }
  }

  // Generate all dates in the GLOBAL range
  const globalAllDates = overallMinDate && overallMaxDate
    ? eachDayOfInterval({
        start: new Date(overallMinDate),
        end: new Date(overallMaxDate),
      }).map(d => format(d, 'yyyy-MM-dd'))
    : [];

  // Build preview data for each employee
  const employeesPreview: EmployeePreviewData[] = [];
  let totalShiftsToCreate = 0;

  for (const [_employeeId, rows] of rowsByEmployee.entries()) {
    const employee = employeeMap.get(rows[0].employeeCode.toLowerCase())!;

    // Sort rows by date
    rows.sort((a, b) => a.date.localeCompare(b.date));

    // Get this employee's specific date range for display
    const firstDate = rows[0].date;
    const lastDate = rows[rows.length - 1].date;

    // Create a map of date -> shift row for this employee
    const shiftMap = new Map<string, ParsedCSVRow>();
    rows.forEach(row => shiftMap.set(row.date, row));

    // Generate shifts with day off markers using GLOBAL date range
    const shifts: ShiftPreviewData[] = [];
    for (const date of globalAllDates) {
      const row = shiftMap.get(date);
      if (row) {
        const shiftType = shiftTypeMap.get(row.shiftTypeName.toLowerCase())!;
        shifts.push({
          date,
          shiftTypeName: row.shiftTypeName,
          startTime: shiftType.startTime,
          endTime: shiftType.endTime,
          note: row.note || null,
          isDayOff: false,
        });
        totalShiftsToCreate++;
      } else {
        shifts.push({
          date,
          shiftTypeName: '—',
          startTime: '—',
          endTime: '—',
          note: null,
          isDayOff: true,
        });
      }
    }

    employeesPreview.push({
      employeeCode: employee.employeeNumber!,
      employeeName: employee.fullName,
      employeeId: employee.id,
      firstDate,
      lastDate,
      totalShifts: shifts.filter(s => !s.isDayOff).length,
      shifts,
    });
  }

  // Sort employees by employee code
  employeesPreview.sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));

  return {
    success: true,
    preview: {
      employees: employeesPreview,
      totalShiftsToCreate,
      totalEmployees: employeesPreview.length,
      dateRange: {
        start: overallMinDate!,
        end: overallMaxDate!,
      },
    },
  };
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
  if (
    header.length < BULK_OFFICE_SHIFT_HEADERS.length ||
    !BULK_OFFICE_SHIFT_HEADERS.every((value, index) => header[index] === value)
  ) {
    return {
      success: false,
      message: `Invalid CSV header. Expected: ${BULK_OFFICE_SHIFT_HEADERS.join(', ')}`,
    };
  }

  const [officeShiftTypes, employees] = await Promise.all([
    prisma.officeShiftType.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, startTime: true, endTime: true },
    }),
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

    const [employeeCode, shiftTypeName, dateStr, note = ''] = cols;
    if (!employeeCode || !shiftTypeName || !dateStr) {
      errors.push(`Row ${i + 1}: employee_code, shift_type_name, and date are required.`);
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

    const overlapInBatch = officeShiftsToCreate.find(
      shift => shift.employeeId === employee.id && shift.startsAt < endDateTime && shift.endsAt > startDateTime
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
