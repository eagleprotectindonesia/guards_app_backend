'use server';

import {
  createRole as dbCreateRole,
  updateRole as dbUpdateRole,
  deleteRole as dbDeleteRole,
} from '@/lib/data-access/roles';
import { checkSuperAdmin } from '@/lib/admin-auth';
import { revalidatePath } from 'next/cache';
import { ActionState } from '@/types/actions';
import {
  createRoleSchema,
  updateRoleSchema,
  CreateRoleInput,
  UpdateRoleInput,
} from '@/lib/validations';

export async function createRole(
  prevState: ActionState<CreateRoleInput>,
  data: CreateRoleInput
): Promise<ActionState<CreateRoleInput>> {
  const admin = await checkSuperAdmin();
  if (!admin) return { success: false, message: 'Unauthorized' };

  const validatedFields = createRoleSchema.safeParse(data);

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Role.',
      success: false,
    };
  }

  try {
    await dbCreateRole(validatedFields.data);
    revalidatePath('/admin/system/roles');
    return { success: true, message: 'Role created successfully' };
  } catch (error) {
    console.error('Database Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to create role',
    };
  }
}

export async function updateRole(
  id: string,
  prevState: ActionState<UpdateRoleInput>,
  data: UpdateRoleInput
): Promise<ActionState<UpdateRoleInput>> {
  const admin = await checkSuperAdmin();
  if (!admin) return { success: false, message: 'Unauthorized' };

  const validatedFields = updateRoleSchema.safeParse(data);

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Role.',
      success: false,
    };
  }

  try {
    await dbUpdateRole(id, validatedFields.data);
    revalidatePath('/admin/system/roles');
    revalidatePath(`/admin/system/roles/${id}/edit`);
    return { success: true, message: 'Role updated successfully' };
  } catch (error) {
    console.error('Database Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to update role',
    };
  }
}

export async function deleteRole(id: string) {
  const admin = await checkSuperAdmin();
  if (!admin) return { success: false, message: 'Unauthorized' };

  try {
    await dbDeleteRole(id);
    revalidatePath('/admin/system/roles');
    return { success: true, message: 'Role deleted successfully' };
  } catch (error) {
    console.error('Database Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to delete role',
    };
  }
}
