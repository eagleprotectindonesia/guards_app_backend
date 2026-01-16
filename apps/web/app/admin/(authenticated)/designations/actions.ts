'use server';

import { createDesignationSchema, CreateDesignationInput, UpdateDesignationInput } from '@/lib/validations';
import { revalidatePath } from 'next/cache';
import { getAdminIdFromToken } from '@/lib/admin-auth';
import {
  createDesignation,
  updateDesignation,
  deleteDesignation,
  checkDesignationRelations,
} from '@/lib/data-access/designations';
import { ActionState } from '@/types/actions';

export async function createDesignationAction(
  prevState: ActionState<CreateDesignationInput>,
  formData: FormData
): Promise<ActionState<CreateDesignationInput>> {
  const adminId = await getAdminIdFromToken();
  const validatedFields = createDesignationSchema.safeParse({
    name: formData.get('name'),
    role: formData.get('role'),
    departmentId: formData.get('departmentId'),
    note: formData.get('note'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Designation.',
      success: false,
    };
  }

  try {
    await createDesignation(validatedFields.data, adminId!);
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to Create Designation.',
      success: false,
    };
  }

  revalidatePath('/admin/designations');
  revalidatePath('/admin/departments'); // Revalidate departments as they might show designations
  return { success: true, message: 'Designation created successfully' };
}

export async function updateDesignationAction(
  id: string,
  prevState: ActionState<UpdateDesignationInput>,
  formData: FormData
): Promise<ActionState<UpdateDesignationInput>> {
  const adminId = await getAdminIdFromToken();
  const validatedFields = createDesignationSchema.safeParse({
    name: formData.get('name'),
    role: formData.get('role'),
    departmentId: formData.get('departmentId'),
    note: formData.get('note'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Designation.',
      success: false,
    };
  }

  try {
    await updateDesignation(id, validatedFields.data, adminId!);
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to Update Designation.',
      success: false,
    };
  }

  revalidatePath('/admin/designations');
  revalidatePath('/admin/departments');
  return { success: true, message: 'Designation updated successfully' };
}

export async function deleteDesignationAction(id: string) {
  try {
    const adminId = await getAdminIdFromToken();
    const { hasEmployees } = await checkDesignationRelations(id);

    if (hasEmployees) {
      return { success: false, message: 'Cannot delete designation: It has associated employees.' };
    }

    await deleteDesignation(id, adminId!);

    revalidatePath('/admin/designations');
    revalidatePath('/admin/departments');
    return { success: true, message: 'Designation deleted successfully' };
  } catch (error) {
    console.error('Database Error:', error);
    return { success: false, message: 'Failed to delete designation' };
  }
}
