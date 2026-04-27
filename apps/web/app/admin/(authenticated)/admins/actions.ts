'use server';

import {
  buildOwnershipAssignmentsFromSelection,
  createAdminWithChangelog,
  deleteAdminWithChangelog,
  findAdminByEmail,
  getAdminById,
  hashPassword,
  replaceAdminOwnershipAssignments,
  updateAdminWithChangelog,
} from '@repo/database';
import { checkSuperAdmin } from '@/lib/admin-auth';
import {
  adminOwnershipFormSchema,
  createAdminSchema,
  updateAdminSchema,
  CreateAdminInput,
  UpdateAdminInput,
} from '@repo/validations';
import { revalidatePath } from 'next/cache';
import { ActionState } from '@/types/actions';

function parseAdminOwnershipForm(formData: FormData) {
  return adminOwnershipFormSchema.safeParse({
    leave: {
      departmentKeys: formData
        .getAll('leaveOwnershipDepartmentKeys')
        .map(value => (typeof value === 'string' ? value : String(value))),
      officeIds: formData
        .getAll('leaveOwnershipOfficeIds')
        .map(value => (typeof value === 'string' ? value : String(value))),
    },
    employees: {
      departmentKeys: formData
        .getAll('employeeVisibilityDepartmentKeys')
        .map(value => (typeof value === 'string' ? value : String(value))),
      officeIds: formData
        .getAll('employeeVisibilityOfficeIds')
        .map(value => (typeof value === 'string' ? value : String(value))),
    },
    includeFallbackLeaveQueue: formData.get('includeFallbackLeaveQueue') === 'on',
  });
}

export async function createAdmin(
  prevState: ActionState<CreateAdminInput>,
  formData: FormData
): Promise<ActionState<CreateAdminInput>> {
  const currentAdmin = await checkSuperAdmin();
  if (!currentAdmin) {
    return {
      message: 'Unauthorized: Only Super Admins can create admins.',
      success: false,
    };
  }

  const validatedFields = createAdminSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    roleId: formData.get('roleId'),
    note: formData.get('note'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Admin.',
      success: false,
    };
  }

  const { name, email, password, roleId, note } = validatedFields.data;
  const ownershipForm = parseAdminOwnershipForm(formData);

  if (!ownershipForm.success) {
    return {
      message: 'Invalid ownership selection. Failed to Create Admin.',
      success: false,
    };
  }

  try {
    const existingAdmin = await findAdminByEmail(email);

    if (existingAdmin) {
      return {
        message: 'Email already exists.',
        success: false,
        errors: { email: ['Email already exists'] },
      };
    }

    const hashedPassword = await hashPassword(password);

    const createdAdmin = await createAdminWithChangelog(
      {
        name,
        email,
        hashedPassword,
        roleRef: { connect: { id: roleId } },
        note: note || null,
        includeFallbackLeaveQueue: ownershipForm.data.includeFallbackLeaveQueue,
      },
      currentAdmin.id
    );

    await replaceAdminOwnershipAssignments({
      adminId: createdAdmin.id,
      domain: 'leave',
      assignments: buildOwnershipAssignmentsFromSelection({
        departmentKeys: ownershipForm.data.leave.departmentKeys,
        officeIds: ownershipForm.data.leave.officeIds,
      }),
      includeFallbackLeaveQueue: ownershipForm.data.includeFallbackLeaveQueue,
      actorId: currentAdmin.id,
    });

    await replaceAdminOwnershipAssignments({
      adminId: createdAdmin.id,
      domain: 'employees',
      assignments: buildOwnershipAssignmentsFromSelection({
        departmentKeys: ownershipForm.data.employees.departmentKeys,
        officeIds: ownershipForm.data.employees.officeIds,
      }),
      actorId: currentAdmin.id,
    });
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to Create Admin.',
      success: false,
    };
  }

  revalidatePath('/admin/admins');
  return { success: true, message: 'Admin created successfully' };
}

export async function updateAdmin(
  id: string,
  prevState: ActionState<UpdateAdminInput>,
  formData: FormData
): Promise<ActionState<UpdateAdminInput>> {
  const currentAdmin = await checkSuperAdmin();
  if (!currentAdmin) {
    return {
      message: 'Unauthorized: Only Super Admins can update admins.',
      success: false,
    };
  }

  const password = formData.get('password');

  const rawData = {
    name: formData.get('name'),
    email: formData.get('email'),
    roleId: formData.get('roleId'),
    note: formData.get('note'),
    ...(password && typeof password === 'string' && password.length > 0 && { password }),
  };

  const validatedFields = updateAdminSchema.safeParse(rawData);

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Admin.',
      success: false,
    };
  }

  const { name, email, roleId, note, password: newPassword } = validatedFields.data;
  const ownershipForm = parseAdminOwnershipForm(formData);

  if (!ownershipForm.success) {
    return {
      message: 'Invalid ownership selection. Failed to Update Admin.',
      success: false,
    };
  }

  try {
    // Check if email is taken by another admin
    const existingAdmin = await findAdminByEmail(email);

    if (existingAdmin && existingAdmin.id !== id) {
      return {
        message: 'Email already exists.',
        success: false,
        errors: { email: ['Email already exists'] },
      };
    }

    const data = {
      name,
      email,
      roleRef: { connect: { id: roleId } },
      note: note || null,
      includeFallbackLeaveQueue: ownershipForm.data.includeFallbackLeaveQueue,
      ...(newPassword && {
        hashedPassword: await hashPassword(newPassword),
        tokenVersion: { increment: 1 },
      }),
    };

    await updateAdminWithChangelog(id, data, currentAdmin.id);

    await replaceAdminOwnershipAssignments({
      adminId: id,
      domain: 'leave',
      assignments: buildOwnershipAssignmentsFromSelection({
        departmentKeys: ownershipForm.data.leave.departmentKeys,
        officeIds: ownershipForm.data.leave.officeIds,
      }),
      includeFallbackLeaveQueue: ownershipForm.data.includeFallbackLeaveQueue,
      actorId: currentAdmin.id,
    });

    await replaceAdminOwnershipAssignments({
      adminId: id,
      domain: 'employees',
      assignments: buildOwnershipAssignmentsFromSelection({
        departmentKeys: ownershipForm.data.employees.departmentKeys,
        officeIds: ownershipForm.data.employees.officeIds,
      }),
      actorId: currentAdmin.id,
    });
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to Update Admin.',
      success: false,
    };
  }

  revalidatePath('/admin/admins');
  return { success: true, message: 'Admin updated successfully' };
}

export async function deleteAdmin(id: string) {
  const currentAdmin = await checkSuperAdmin();
  if (!currentAdmin) {
    return { success: false, message: 'Unauthorized: Only Super Admins can delete admins.' };
  }

  try {
    const adminToDelete = await getAdminById(id);

    if (!adminToDelete) {
      return { success: false, message: 'Admin not found.' };
    }

    if (adminToDelete.roleRef?.name === 'Super Admin') {
      return { success: false, message: 'Cannot delete a Super Admin Role.' };
    }

    await deleteAdminWithChangelog(id, currentAdmin.id);

    revalidatePath('/admin/admins');
    return { success: true };
  } catch (error) {
    console.error('Database Error:', error);
    return { success: false, message: 'Failed to delete admin' };
  }
}

export async function disableAdmin2FA(id: string) {
  const currentAdmin = await checkSuperAdmin();
  if (!currentAdmin) {
    return { success: false, message: 'Unauthorized: Only Super Admins can disable 2FA.' };
  }

  try {
    await updateAdminWithChangelog(
      id,
      {
        twoFactorSecret: null,
        twoFactorEnabled: false,
      },
      currentAdmin.id
    );

    revalidatePath('/admin/admins');
    return { success: true, message: '2FA disabled successfully for this admin.' };
  } catch (error) {
    console.error('Database Error:', error);
    return { success: false, message: 'Failed to disable 2FA' };
  }
}
