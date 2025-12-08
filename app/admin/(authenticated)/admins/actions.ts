'use server';

import { prisma } from '@/lib/prisma';
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

export async function createAdmin(prevState: ActionState, formData: FormData): Promise<ActionState> {
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
    const existingAdmin = await prisma.admin.findUnique({
      where: { email },
    });

    if (existingAdmin) {
      return {
        message: 'Email already exists.',
        success: false,
        errors: { email: ['Email already exists'] }
      };
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.admin.create({
      data: {
        name,
        email,
        hashedPassword,
        role: role as any,
      },
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

export async function updateAdmin(id: string, prevState: ActionState, formData: FormData): Promise<ActionState> {
  const rawData: any = {
    name: formData.get('name'),
    email: formData.get('email'),
    role: formData.get('role'),
  };
  
  const password = formData.get('password');
  if (password && typeof password === 'string' && password.length > 0) {
    rawData.password = password;
  }

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
    const existingAdmin = await prisma.admin.findFirst({
        where: { 
            email,
            id: { not: id } 
        }
    });

    if (existingAdmin) {
        return {
            message: 'Email already exists.',
            success: false,
            errors: { email: ['Email already exists'] }
        };
    }

    const data: any = {
      name,
      email,
      role: role as any,
    };

    if (newPassword) {
      data.hashedPassword = await bcrypt.hash(newPassword, 10);
    }

    await prisma.admin.update({
      where: { id },
      data,
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
  try {
    await prisma.admin.delete({
      where: { id },
    });
    revalidatePath('/admin/admins');
    return { success: true };
  } catch (error) {
    console.error('Database Error:', error);
    return { success: false, message: 'Failed to delete admin' };
  }
}
