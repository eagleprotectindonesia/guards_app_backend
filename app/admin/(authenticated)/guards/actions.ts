'use server';

import { prisma } from '@/lib/prisma';
import { createGuardSchema, updateGuardSchema, updateGuardPasswordSchema } from '@/lib/validations';
import { hashPassword } from '@/lib/utils';
import { revalidatePath } from 'next/cache';

export type ActionState = {
  message?: string;
  errors?: {
    name?: string[];
    phone?: string[];
    password?: string[];
    confirmPassword?: string[];
  };
  success?: boolean;
};

export async function createGuard(prevState: ActionState, formData: FormData): Promise<ActionState> {
  const validatedFields = createGuardSchema.safeParse({
    name: formData.get('name'),
    phone: formData.get('phone'),
    guardCode: formData.get('guardCode')?.toString() || undefined,
    status: formData.get('status') === 'true' ? true : (formData.get('status') === 'false' ? false : undefined),
    joinDate: formData.get('joinDate')?.toString() || undefined,
    leftDate: formData.get('leftDate')?.toString() || undefined,
    note: formData.get('note')?.toString() || undefined,
    password: formData.get('password')?.toString(),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Guard.',
      success: false,
    };
  }

  const { password, ...restData } = validatedFields.data;

  try {
    // Hash the password if provided
    const dataToCreate = {
      ...restData,
      hashedPassword: await hashPassword(password),
    };

    await prisma.guard.create({
      data: dataToCreate,
    });
  } catch (error) {
    // Check for unique constraint violation on phone
    // @ts-expect-error - Prisma error types are tricky to catch explicitly without full types
    if (error.code === 'P2002') {
      return {
        message: 'A guard with this phone number already exists.',
        success: false,
      };
    }

    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to Create Guard.',
      success: false,
    };
  }

  revalidatePath('/admin/guards');
  return { success: true, message: 'Guard created successfully' };
}

export async function updateGuard(id: string, prevState: ActionState, formData: FormData): Promise<ActionState> {
  const validatedFields = updateGuardSchema.safeParse({
    name: formData.get('name'),
    phone: formData.get('phone'),
    guardCode: formData.get('guardCode')?.toString() || undefined,
    status: formData.get('status') === 'true' ? true : (formData.get('status') === 'false' ? false : undefined),
    joinDate: formData.get('joinDate')?.toString() || undefined,
    leftDate: formData.get('leftDate')?.toString() || undefined,
    note: formData.get('note')?.toString() || undefined,
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Guard.',
      success: false,
    };
  }

  try {
    await prisma.guard.update({
      where: { id },
      data: validatedFields.data,
    });
  } catch (error) {
    // @ts-expect-error - Prisma error types are tricky to catch explicitly without full types
    if (error.code === 'P2002') {
      return {
        message: 'A guard with this phone number already exists.',
        success: false,
      };
    }
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to Update Guard.',
      success: false,
    };
  }

  revalidatePath('/admin/guards');
  return { success: true, message: 'Guard updated successfully' };
}

export async function updateGuardPassword(id: string, prevState: ActionState, formData: FormData): Promise<ActionState> {
  const validatedFields = updateGuardPasswordSchema.safeParse({
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
    await prisma.guard.update({
      where: { id },
      data: { hashedPassword },
    });
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to update password.',
      success: false,
    };
  }

  revalidatePath('/admin/guards');
  return { success: true, message: 'Password updated successfully' };
}

export async function deleteGuard(id: string) {
  try {
    await prisma.guard.delete({
      where: { id },
    });
    revalidatePath('/admin/guards');
    return { success: true };
  } catch (error) {
    console.error('Database Error:', error);
    return { success: false, message: 'Failed to delete guard' };
  }
}
