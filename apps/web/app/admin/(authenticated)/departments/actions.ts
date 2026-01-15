'use server';

import { createDepartmentSchema, CreateDepartmentInput, UpdateDepartmentInput } from '@/lib/validations';
import { revalidatePath } from 'next/cache';
import { getAdminIdFromToken } from '@/lib/admin-auth';
import {
  createDepartment,
  updateDepartment,
  deleteDepartment,
  checkDepartmentRelations,
} from '@/lib/data-access/departments';
import { ActionState } from '@/types/actions';

export async function createDepartmentAction(
  prevState: ActionState<CreateDepartmentInput>,
  formData: FormData
): Promise<ActionState<CreateDepartmentInput>> {
  const adminId = await getAdminIdFromToken();
  const validatedFields = createDepartmentSchema.safeParse({
    name: formData.get('name'),
    note: formData.get('note'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Department.',
      success: false,
    };
  }

  try {
    await createDepartment(validatedFields.data, adminId!);
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to Create Department.',
      success: false,
    };
  }

  revalidatePath('/admin/departments');
  return { success: true, message: 'Department created successfully' };
}

export async function updateDepartmentAction(
  id: string,
  prevState: ActionState<UpdateDepartmentInput>,
  formData: FormData
): Promise<ActionState<UpdateDepartmentInput>> {
  const adminId = await getAdminIdFromToken();
  const validatedFields = createDepartmentSchema.safeParse({
    name: formData.get('name'),
    note: formData.get('note'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Department.',
      success: false,
    };
  }

  try {
    await updateDepartment(id, validatedFields.data, adminId!);
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to Update Department.',
      success: false,
    };
  }

  revalidatePath('/admin/departments');
  return { success: true, message: 'Department updated successfully' };
}

export async function deleteDepartmentAction(id: string) {
  try {
    const adminId = await getAdminIdFromToken();
    const { hasDesignations, hasEmployees } = await checkDepartmentRelations(id);

    if (hasDesignations) {
      return { success: false, message: 'Cannot delete department: It has associated designations.' };
    }

    if (hasEmployees) {
      return { success: false, message: 'Cannot delete department: It has associated employees.' };
    }

    await deleteDepartment(id, adminId!);

    revalidatePath('/admin/departments');
    return { success: true, message: 'Department deleted successfully' };
  } catch (error) {
    console.error('Database Error:', error);
    return { success: false, message: 'Failed to delete department' };
  }
}
