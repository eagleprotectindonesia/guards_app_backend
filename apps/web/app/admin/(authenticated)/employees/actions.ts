'use server';

import {
  updateEmployee as updateEmployeeDb,
  updateEmployeeFieldMode as updateEmployeeFieldModeDb,
  getAllEmployees,
  getActiveEmployees,
  getAllOfficeWorkSchedules,
  EmployeePasswordPolicyError,
  setEmployeePassword,
  getEmployeeSearchWhere,
} from '@repo/database';
import {
  updateEmployeeSchema,
  UpdateEmployeeInput,
  updateEmployeePasswordSchema,
  UpdateEmployeePasswordInput,
  updateEmployeeFieldModeSchema,
  UpdateEmployeeFieldModeInput,
  createEmployeeOfficeWorkScheduleAssignmentSchema,
  CreateEmployeeOfficeWorkScheduleAssignmentInput,
} from '@repo/validations';
import { serialize } from '@/lib/server-utils';
import type { Serialized } from '@/lib/server-utils';
import { hashPassword } from '@repo/database';
import { revalidatePath } from 'next/cache';
import { EmployeeWithRelationsAndSchedule } from '@repo/database';
import { getAdminIdFromToken } from '@/lib/admin-auth';
import { requirePermission } from '@/lib/admin-auth';
import { ActionState } from '@/types/actions';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { applyEmployeeVisibilityScope } from '@/lib/auth/admin-visibility';
import {
  bulkUpsertFutureOfficeWorkScheduleAssignments,
  deleteFutureOfficeWorkScheduleAssignment,
  scheduleFutureOfficeWorkScheduleAssignment,
  updateFutureOfficeWorkScheduleAssignment,
} from '@repo/database';

const BULK_OFFICE_SCHEDULE_HEADERS = ['employee_number', 'schedule_name', 'effective_from'] as const;

function parseCsvLine(line: string) {
  return line.split(',').map(value => value.trim().replace(/^"|"$/g, ''));
}

revalidatePath('/admin/employees');

export async function updateEmployee(
  id: string,
  prevState: ActionState<UpdateEmployeeInput>,
  formData: FormData
): Promise<ActionState<UpdateEmployeeInput>> {
  const adminId = await getAdminIdFromToken();
  if (!adminId) return { success: false, message: 'Unauthorized' };

  const rawData = Object.fromEntries(formData.entries());
  const dataToValidate = {
    ...rawData,
    status: rawData.status === 'true',
  };

  const validatedFields = updateEmployeeSchema.safeParse(dataToValidate);

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Invalid input. Failed to update employee.',
      success: false,
    };
  }

  try {
    const { password, ...data } = validatedFields.data;
    const updateData: Record<string, unknown> = { ...data };

    if (password) {
      updateData.hashedPassword = await hashPassword(password);
    }

    await updateEmployeeDb(id, updateData);
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to update employee.',
      success: false,
    };
  }

  revalidatePath('/admin/employees');
  return { success: true, message: 'Employee updated successfully' };
}

export async function getAllEmployeesForExport(params: {
  query?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}): Promise<Serialized<EmployeeWithRelationsAndSchedule>[]> {
  const session = await requirePermission(PERMISSIONS.EMPLOYEES.VIEW);
  const { query, sortBy, sortOrder } = params;

  // Build where clause to match the main employees page
  const where = applyEmployeeVisibilityScope(getEmployeeSearchWhere(query), session);

  // Handle sorting parameters
  const validSortFields = ['fullName', 'employeeNumber', 'department', 'jobTitle'];
  const sortField = validSortFields.includes(sortBy || '') ? sortBy : 'fullName';

  const employees = await getAllEmployees({
    where,
    orderBy: { [sortField as string]: sortOrder || 'asc' },
    includeDeleted: false, // Exporting active employees typically
  });

  return serialize(employees);
}

export async function updateEmployeePassword(
  id: string,
  prevState: ActionState<UpdateEmployeePasswordInput>,
  formData: FormData
): Promise<ActionState<UpdateEmployeePasswordInput>> {
  const validatedFields = updateEmployeePasswordSchema.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Invalid input. Failed to update password.',
      success: false,
    };
  }

  try {
    const adminId = await getAdminIdFromToken();

    await setEmployeePassword({
      employeeId: id,
      newPassword: validatedFields.data.password,
      actor: { type: 'admin', adminId: adminId! },
      mustChangePassword: true,
      enforceHistoryPolicy: false,
    });
  } catch (error) {
    if (error instanceof EmployeePasswordPolicyError) {
      return {
        errors: { password: [error.message] },
        message: error.message,
        success: false,
      };
    }

    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to update password.',
      success: false,
    };
  }

  revalidatePath('/admin/employees');
  return { success: true, message: 'Password updated successfully' };
}

export async function updateEmployeeFieldMode(
  id: string,
  prevState: ActionState<UpdateEmployeeFieldModeInput>,
  formData: FormData
): Promise<ActionState<UpdateEmployeeFieldModeInput>> {
  await requirePermission(PERMISSIONS.EMPLOYEES.EDIT);

  const validatedFields = updateEmployeeFieldModeSchema.safeParse({
    fieldModeEnabled: formData.get('fieldModeEnabled') === 'true',
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Invalid input. Failed to update field mode.',
      success: false,
    };
  }

  try {
    await updateEmployeeFieldModeDb(id, validatedFields.data.fieldModeEnabled);
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: error instanceof Error ? error.message : 'Database Error: Failed to update field mode.',
      success: false,
    };
  }

  revalidatePath(`/admin/employees/${id}/edit`);
  revalidatePath('/admin/employees');
  return { success: true, message: 'Field mode updated successfully.' };
}

export async function syncEmployeesAction() {
  const adminId = await getAdminIdFromToken();
  if (!adminId) return { success: false, message: 'Unauthorized' };

  try {
    const [{ EMPLOYEE_SYNC_JOB_NAME }, { employeeSyncQueue }] = await Promise.all([
      import('@repo/database'),
      import('@/lib/queues'),
    ]);

    await employeeSyncQueue.add(EMPLOYEE_SYNC_JOB_NAME, { triggeredBy: adminId });
    return {
      success: true,
      message: 'Sync queued. The employee list will update shortly.',
    };
  } catch (error) {
    console.error('Sync Action Error:', error);
    return { success: false, message: 'Failed to queue sync' };
  }
}

export async function scheduleEmployeeOfficeWorkSchedule(
  employeeId: string,
  prevState: ActionState<CreateEmployeeOfficeWorkScheduleAssignmentInput>,
  formData: FormData
): Promise<ActionState<CreateEmployeeOfficeWorkScheduleAssignmentInput>> {
  await requirePermission(PERMISSIONS.EMPLOYEES.EDIT);
  const adminId = await getAdminIdFromToken();

  const validatedFields = createEmployeeOfficeWorkScheduleAssignmentSchema.safeParse({
    officeWorkScheduleId: formData.get('officeWorkScheduleId'),
    effectiveFrom: formData.get('effectiveFrom'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Invalid input. Failed to schedule employee office schedule.',
      success: false,
    };
  }

  const effectiveFrom = new Date(`${validatedFields.data.effectiveFrom}T00:00:00+08:00`);
  if (Number.isNaN(effectiveFrom.getTime())) {
    return {
      errors: { effectiveFrom: ['Effective date is invalid'] },
      message: 'Invalid input. Failed to schedule employee office schedule.',
      success: false,
    };
  }

  try {
    await scheduleFutureOfficeWorkScheduleAssignment({
      employeeId,
      officeWorkScheduleId: validatedFields.data.officeWorkScheduleId,
      effectiveFrom,
      actor: adminId ? { type: 'admin', id: adminId } : { type: 'unknown' },
      source: 'single_update',
    });
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: error instanceof Error ? error.message : 'Database Error: Failed to schedule employee office schedule.',
      success: false,
    };
  }

  revalidatePath(`/admin/employees/${employeeId}/edit`);
  return { success: true, message: 'Employee schedule change saved successfully.' };
}

export async function updateEmployeeOfficeWorkScheduleAssignment(
  employeeId: string,
  assignmentId: string,
  prevState: ActionState<CreateEmployeeOfficeWorkScheduleAssignmentInput>,
  formData: FormData
): Promise<ActionState<CreateEmployeeOfficeWorkScheduleAssignmentInput>> {
  await requirePermission(PERMISSIONS.EMPLOYEES.EDIT);
  const adminId = await getAdminIdFromToken();

  const validatedFields = createEmployeeOfficeWorkScheduleAssignmentSchema.safeParse({
    officeWorkScheduleId: formData.get('officeWorkScheduleId'),
    effectiveFrom: formData.get('effectiveFrom'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Invalid input. Failed to update employee office schedule.',
      success: false,
    };
  }

  const effectiveFrom = new Date(`${validatedFields.data.effectiveFrom}T00:00:00+08:00`);
  if (Number.isNaN(effectiveFrom.getTime())) {
    return {
      errors: { effectiveFrom: ['Effective date is invalid'] },
      message: 'Invalid input. Failed to update employee office schedule.',
      success: false,
    };
  }

  try {
    await updateFutureOfficeWorkScheduleAssignment({
      assignmentId,
      officeWorkScheduleId: validatedFields.data.officeWorkScheduleId,
      effectiveFrom,
      actor: adminId ? { type: 'admin', id: adminId } : { type: 'unknown' },
      source: 'timeline_edit',
    });
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: error instanceof Error ? error.message : 'Database Error: Failed to update employee office schedule.',
      success: false,
    };
  }

  revalidatePath(`/admin/employees/${employeeId}/edit`);
  return { success: true, message: 'Employee schedule assignment updated successfully.' };
}

export async function deleteEmployeeOfficeWorkScheduleAssignment(
  employeeId: string,
  assignmentId: string
): Promise<{ success: boolean; message?: string }> {
  await requirePermission(PERMISSIONS.EMPLOYEES.EDIT);
  const adminId = await getAdminIdFromToken();

  try {
    await deleteFutureOfficeWorkScheduleAssignment({
      assignmentId,
      actor: adminId ? { type: 'admin', id: adminId } : { type: 'unknown' },
      source: 'timeline_delete',
    });
  } catch (error) {
    console.error('Database Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Database Error: Failed to delete employee office schedule.',
    };
  }

  revalidatePath(`/admin/employees/${employeeId}/edit`);
  return { success: true, message: 'Employee schedule assignment deleted successfully.' };
}

export async function bulkScheduleEmployeeOfficeWorkSchedules(
  formData: FormData
): Promise<{ success: boolean; message?: string; errors?: string[] }> {
  await requirePermission(PERMISSIONS.EMPLOYEES.EDIT);
  const adminId = await getAdminIdFromToken();

  const file = formData.get('file') as File | null;
  if (!file) {
    return { success: false, message: 'No file provided.' };
  }

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');

  if (lines.length < 2) {
    return { success: false, message: 'CSV file is empty or missing data.' };
  }

  const headerColumns = parseCsvLine(lines[0]).map(value => value.toLowerCase());
  if (
    headerColumns.length < BULK_OFFICE_SCHEDULE_HEADERS.length ||
    BULK_OFFICE_SCHEDULE_HEADERS.some((header, index) => headerColumns[index] !== header)
  ) {
    return {
      success: false,
      message: `Invalid CSV headers. Expected: ${BULK_OFFICE_SCHEDULE_HEADERS.join(', ')}`,
    };
  }

  const [employees, schedules] = await Promise.all([getActiveEmployees(), getAllOfficeWorkSchedules()]);

  const employeeMap = new Map(
    employees
      .filter(employee => employee.employeeNumber)
      .map(employee => [employee.employeeNumber as string, employee])
  );
  const scheduleMap = new Map(schedules.map(schedule => [schedule.name, schedule]));

  const errors: string[] = [];
  const seenEmployeeDates = new Set<string>();
  const assignments: Array<{
    employeeId: string;
    officeWorkScheduleId: string;
    effectiveFrom: Date;
  }> = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);

    if (cols.length < BULK_OFFICE_SCHEDULE_HEADERS.length) {
      errors.push(`Row ${i + 1}: Expected 3 columns (employee_number, schedule_name, effective_from).`);
      continue;
    }

    const [employeeNumber, scheduleName, effectiveFromText] = cols;

    if (!employeeNumber || !scheduleName || !effectiveFromText) {
      errors.push(`Row ${i + 1}: employee_number, schedule_name, and effective_from are required.`);
      continue;
    }

    const duplicateKey = `${employeeNumber}::${effectiveFromText}`;
    if (seenEmployeeDates.has(duplicateKey)) {
      errors.push(`Row ${i + 1}: Duplicate employee_number and effective_from combination in the uploaded CSV.`);
      continue;
    }
    seenEmployeeDates.add(duplicateKey);

    const employee = employeeMap.get(employeeNumber);
    if (!employee) {
      errors.push(`Row ${i + 1}: Employee '${employeeNumber}' not found or inactive.`);
      continue;
    }

    if (employee.role !== 'office') {
      errors.push(`Row ${i + 1}: Employee '${employeeNumber}' is not an office employee.`);
      continue;
    }

    const schedule = scheduleMap.get(scheduleName);
    if (!schedule) {
      errors.push(`Row ${i + 1}: Office schedule '${scheduleName}' not found.`);
      continue;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(effectiveFromText)) {
      errors.push(`Row ${i + 1}: Invalid effective_from '${effectiveFromText}'. Expected YYYY-MM-DD.`);
      continue;
    }

    const effectiveFrom = new Date(`${effectiveFromText}T00:00:00+08:00`);
    if (Number.isNaN(effectiveFrom.getTime())) {
      errors.push(`Row ${i + 1}: Invalid effective_from '${effectiveFromText}'.`);
      continue;
    }

    assignments.push({
      employeeId: employee.id,
      officeWorkScheduleId: schedule.id,
      effectiveFrom,
    });
  }

  if (errors.length > 0) {
    return {
      success: false,
      message: 'Validation failed.',
      errors,
    };
  }

  if (assignments.length === 0) {
    return { success: false, message: 'No valid office schedule assignments found to import.' };
  }

  assignments.sort(
    (left, right) => left.employeeId.localeCompare(right.employeeId) || left.effectiveFrom.getTime() - right.effectiveFrom.getTime()
  );

  try {
    await bulkUpsertFutureOfficeWorkScheduleAssignments(assignments, {
      actor: adminId ? { type: 'admin', id: adminId } : { type: 'unknown' },
      source: 'bulk_import',
    });
  } catch (error) {
    console.error('Bulk office schedule import error:', error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : 'Database Error: Failed to import office schedule assignments.',
    };
  }

  revalidatePath('/admin/employees');
  return {
    success: true,
    message: `Successfully imported ${assignments.length} office schedule assignment${assignments.length === 1 ? '' : 's'} with future timelines normalized.`,
  };
}
