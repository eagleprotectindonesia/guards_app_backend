'use server';

import {
  createAdminWithChangelog,
  deleteAdminWithChangelog,
  findAdminByEmail,
  getAdminById,
  updateAdminWithChangelog,
} from '@/lib/data-access/admins';
import { getCurrentAdmin } from '@/lib/admin-auth';
import { createAdminSchema, updateAdminSchema } from '@/lib/validations';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';

export type ActionState = {
  message?: string;
  errors?: {
    name?: string[];
    email?: string[];
    password?: string[];
    role?: string[];
  };
  success?: boolean;
};

async function checkSuperAdmin() {
  const currentAdmin = await getCurrentAdmin();
  if (currentAdmin?.role !== 'superadmin') {
    return null;
  }
  return currentAdmin;
}

export async function createAdmin(prevState: ActionState, formData: FormData): Promise<ActionState> {
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
    role: formData.get('role'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Admin.',
      success: false,
    };
  }

  const { name, email, password, role } = validatedFields.data;

  try {
    const existingAdmin = await findAdminByEmail(email);

    if (existingAdmin) {
      return {
        message: 'Email already exists.',
        success: false,
        errors: { email: ['Email already exists'] },
      };
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await createAdminWithChangelog(
      {
        name,
        email,
        hashedPassword,
        role: role,
      },
      currentAdmin.id
    );
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

export async function updateAdmin(id: string, prevState: ActionState, formData: FormData): Promise<ActionState> {
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
    role: formData.get('role'),
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

  const { name, email, role, password: newPassword } = validatedFields.data;

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
      role,
      ...(newPassword && {
        hashedPassword: await bcrypt.hash(newPassword, 10),
        tokenVersion: { increment: 1 },
      }),
    };

    await updateAdminWithChangelog(id, data, currentAdmin.id);
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

    if (adminToDelete.role === 'superadmin') {
      return { success: false, message: 'Cannot delete a Super Admin. Change their role to Admin first.' };
    }

    await deleteAdminWithChangelog(id, currentAdmin.id);

    revalidatePath('/admin/admins');
    return { success: true };
  } catch (error) {
    console.error('Database Error:', error);
    return { success: false, message: 'Failed to delete admin' };
  }
}
