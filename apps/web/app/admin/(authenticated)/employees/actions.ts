'use server';

import {
  updateEmployee as updateEmployeeDb,
  getAllEmployees,
  updateEmployeePasswordWithChangelog,
} from '@/lib/data-access/employees';
import {
  updateEmployeeSchema,
  UpdateEmployeeInput,
  updateEmployeePasswordSchema,
  UpdateEmployeePasswordInput,
} from '@/lib/validations';
import { hashPassword, serialize, Serialized } from '@/lib/utils';
import { revalidatePath } from 'next/cache';
import { EmployeeWithRelations } from '@repo/database';
import { getAdminIdFromToken } from '@/lib/admin-auth';
import { ActionState } from '@/types/actions';
import { syncEmployeesFromExternal } from '@repo/database';

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

export async function getAllEmployeesForExport(): Promise<Serialized<EmployeeWithRelations>[]> {
  const employees = await getAllEmployees(undefined, true);
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
    const hashedPassword = await hashPassword(validatedFields.data.password);
    const adminId = await getAdminIdFromToken();

    await updateEmployeePasswordWithChangelog(id, hashedPassword, adminId!);
  } catch (error) {
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
    const result = await syncEmployeesFromExternal({ type: 'system', id: adminId });
    return {
      success: true,
      message: 'Sync completed successfully',
      added: result.added,
      updated: result.updated,
      deactivated: result.deactivated,
    };
  } catch (error) {
    console.error('Sync Action Error:', error);
    return { success: false, message: 'Failed to sync employees' };
  }
}
