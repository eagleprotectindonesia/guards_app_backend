'use server';

import { createSiteSchema } from '@/lib/validations';
import { revalidatePath } from 'next/cache';
import { getAdminIdFromToken } from '@/lib/admin-auth';
import {
  createSiteWithChangelog,
  updateSiteWithChangelog,
  deleteSiteWithChangelog,
  checkSiteRelations,
} from '@/lib/data-access/sites';

export type ActionState = {
  message?: string;
  errors?: {
    name?: string[];
    clientName?: string[];
    address?: string[];
    latitude?: string[];
    longitude?: string[];
  };
  success?: boolean;
};

export async function createSite(prevState: ActionState, formData: FormData): Promise<ActionState> {
  const adminId = await getAdminIdFromToken();
  const validatedFields = createSiteSchema.safeParse({
    name: formData.get('name'),
    clientName: formData.get('clientName'),
    address: formData.get('address'),
    latitude: parseFloat(formData.get('latitude') as string),
    longitude: parseFloat(formData.get('longitude') as string),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Site.',
      success: false,
    };
  }

  try {
    await createSiteWithChangelog(validatedFields.data, adminId!);
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
  const adminId = await getAdminIdFromToken();
  const validatedFields = createSiteSchema.safeParse({
    name: formData.get('name'),
    clientName: formData.get('clientName'),
    address: formData.get('address'),
    latitude: parseFloat(formData.get('latitude') as string),
    longitude: parseFloat(formData.get('longitude') as string),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Site.',
      success: false,
    };
  }

  try {
    await updateSiteWithChangelog(id, validatedFields.data, adminId!);
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
    const adminId = await getAdminIdFromToken();
    const { hasShifts, hasAlerts } = await checkSiteRelations(id);

    if (hasShifts) {
      return { success: false, message: 'Cannot delete site: It has associated shifts.' };
    }

    if (hasAlerts) {
      return { success: false, message: 'Cannot delete site: It has associated alerts.' };
    }

    await deleteSiteWithChangelog(id, adminId!);

    revalidatePath('/admin/sites');
    return { success: true };
  } catch (error) {
    console.error('Database Error:', error);
    return { success: false, message: 'Failed to delete site' };
  }
}
