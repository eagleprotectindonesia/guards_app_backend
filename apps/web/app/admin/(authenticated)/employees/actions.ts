'use server';

import {
  createEmployee as createEmployeeDb,
  updateEmployee as updateEmployeeDb,
  getAllEmployees,
  updateEmployeePasswordWithChangelog,
} from '@/lib/data-access/employees';
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  CreateEmployeeInput,
  UpdateEmployeeInput,
  updateEmployeePasswordSchema,
  UpdateEmployeePasswordInput,
} from '@/lib/validations';
import { hashPassword, serialize, Serialized } from '@/lib/utils';
import { revalidatePath } from 'next/cache';
import { EmployeeWithRelations } from '@repo/database';
import { getAdminIdFromToken } from '@/lib/admin-auth';
import { ActionState } from '@/types/actions';
import { cookies } from 'next/headers';

export async function createEmployee(
  prevState: ActionState<CreateEmployeeInput>,
  formData: FormData
): Promise<ActionState<CreateEmployeeInput>> {
  const adminId = await getAdminIdFromToken();
  if (!adminId) return { success: false, message: 'Unauthorized' };

  const rawData = Object.fromEntries(formData.entries());
  const dataToValidate = {
    ...rawData,
    status: rawData.status === 'true'
  };

  const validatedFields = createEmployeeSchema.safeParse(dataToValidate);

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Invalid input. Failed to create employee.',
      success: false,
    };
  }

  try {
    const { password, ...data } = validatedFields.data;
    const hashedPassword = await hashPassword(password);
    
    await createEmployeeDb({
      ...data,
      hashedPassword,
    });
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to create employee.',
      success: false,
    };
  }

  revalidatePath('/admin/employees');
  return { success: true, message: 'Employee created successfully' };
}

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
    status: rawData.status === 'true'
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

export async function getAllEmployeesForExport(): Promise<
  Serialized<EmployeeWithRelations>[]
> {
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
    // This calls the internal API route or the processor directly
    // For simplicity, we trigger the API route we created
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    const res = await fetch(`${baseUrl}/api/admin/employees/sync`, { 
      method: 'POST',
      headers: {
        'Cookie': `token=${token}` 
      }
    });
    return await res.json();
  } catch (error) {
    console.error('Sync Action Error:', error);
    return { success: false, message: 'Failed to trigger sync' };
  }
}
