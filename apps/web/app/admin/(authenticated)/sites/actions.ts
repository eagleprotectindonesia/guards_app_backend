'use server';

import { createSiteSchema, CreateSiteInput, UpdateSiteInput } from '@/lib/validations';
import { revalidatePath } from 'next/cache';
import { getAdminIdFromToken } from '@/lib/admin-auth';
import {
  createSiteWithChangelog,
  updateSiteWithChangelog,
  deleteSiteWithChangelog,
  checkSiteRelations,
  getAllSites,
} from '@/lib/data-access/sites';
import { ActionState } from '@/types/actions';
import { Site } from '@prisma/client';
import { serialize, Serialized } from '@/lib/utils';

export async function getAllSitesForExport(): Promise<
  Serialized<Site & { lastUpdatedBy?: { name: string } | null; createdBy?: { name: string } | null }>[]
> {
  const sites = await getAllSites(true);
  return serialize(sites);
}

export async function createSite(
  prevState: ActionState<CreateSiteInput>,
  formData: FormData
): Promise<ActionState<CreateSiteInput>> {
  const adminId = await getAdminIdFromToken();
  const validatedFields = createSiteSchema.safeParse({
    name: formData.get('name'),
    clientName: formData.get('clientName'),
    address: formData.get('address'),
    latitude: parseFloat(formData.get('latitude') as string),
    longitude: parseFloat(formData.get('longitude') as string),
    geofenceRadius: parseFloat(formData.get('geofenceRadius') as string),
    status: formData.get('status') === 'true',
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
  revalidatePath('/admin/shifts', 'layout');
  revalidatePath('/admin/dashboard');
  return { success: true, message: 'Site created successfully' };
}

export async function updateSite(
  id: string,
  prevState: ActionState<UpdateSiteInput>,
  formData: FormData
): Promise<ActionState<UpdateSiteInput>> {
  const adminId = await getAdminIdFromToken();
  const validatedFields = createSiteSchema.safeParse({
    name: formData.get('name'),
    clientName: formData.get('clientName'),
    address: formData.get('address'),
    latitude: parseFloat(formData.get('latitude') as string),
    longitude: parseFloat(formData.get('longitude') as string),
    geofenceRadius: parseFloat(formData.get('geofenceRadius') as string),
    status: formData.get('status') === 'true',
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
  revalidatePath('/admin/shifts', 'layout');
  revalidatePath('/admin/dashboard');
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
    revalidatePath('/admin/shifts', 'layout');
    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Database Error:', error);
    return { success: false, message: 'Failed to delete site' };
  }
}
