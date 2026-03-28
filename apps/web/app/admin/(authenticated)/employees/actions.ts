'use server';

import {
  updateEmployee as updateEmployeeDb,
  getAllEmployees,
  EmployeePasswordPolicyError,
  setEmployeePassword,
  getEmployeeSearchWhere,
} from '@repo/database';
import {
  updateEmployeeSchema,
  UpdateEmployeeInput,
  updateEmployeePasswordSchema,
  UpdateEmployeePasswordInput,
  createEmployeeOfficeWorkScheduleAssignmentSchema,
  CreateEmployeeOfficeWorkScheduleAssignmentInput,
} from '@repo/validations';
import { serialize } from '@/lib/server-utils';
import type { Serialized } from '@/lib/server-utils';
import { hashPassword } from '@repo/database';
import { revalidatePath } from 'next/cache';
import { EmployeeWithRelations } from '@repo/database';
import { getAdminIdFromToken } from '@/lib/admin-auth';
import { requirePermission } from '@/lib/admin-auth';
import { ActionState } from '@/types/actions';
import { EMPLOYEE_SYNC_JOB_NAME } from '@repo/database';
import { employeeSyncQueue } from '@/lib/queues';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { applyEmployeeVisibilityScope } from '@/lib/auth/admin-visibility';
import { scheduleFutureOfficeWorkScheduleAssignment } from '@repo/database';

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
}): Promise<Serialized<EmployeeWithRelations>[]> {
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

export async function syncEmployeesAction() {
  const adminId = await getAdminIdFromToken();
  if (!adminId) return { success: false, message: 'Unauthorized' };

  try {
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
