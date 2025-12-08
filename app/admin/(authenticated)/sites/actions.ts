'use server';

import { prisma } from '@/lib/prisma';
import { createSiteSchema } from '@/lib/validations';
import { revalidatePath } from 'next/cache';

export type ActionState = {
  message?: string;
  errors?: {
    name?: string[];
    clientName?: string[];
    timeZone?: string[];
  };
  success?: boolean;
};

export async function createSite(prevState: ActionState, formData: FormData): Promise<ActionState> {
  const validatedFields = createSiteSchema.safeParse({
    name: formData.get('name'),
    clientName: formData.get('clientName'),
    timeZone: formData.get('timeZone'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Site.',
      success: false,
    };
  }

  try {
    await prisma.site.create({
      data: {
        ...validatedFields.data,
        timeZone: validatedFields.data.timeZone || 'UTC',
      },
    });
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to Create Site.',
      success: false,
    };
  }

  revalidatePath('/admin/sites');
  return { success: true, message: 'Site created successfully' };
}

export async function updateSite(id: string, prevState: ActionState, formData: FormData): Promise<ActionState> {
  const validatedFields = createSiteSchema.safeParse({
    name: formData.get('name'),
    clientName: formData.get('clientName'),
    timeZone: formData.get('timeZone'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Site.',
      success: false,
    };
  }

  try {
    await prisma.site.update({
      where: { id },
      data: validatedFields.data,
    });
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to Update Site.',
      success: false,
    };
  }

  revalidatePath('/admin/sites');
  return { success: true, message: 'Site updated successfully' };
}

export async function deleteSite(id: string) {
  try {
    await prisma.site.delete({
      where: { id },
    });
    revalidatePath('/admin/sites');
    return { success: true };
  } catch (error) {
    console.error('Database Error:', error);
    return { success: false, message: 'Failed to delete site' };
  }
}
