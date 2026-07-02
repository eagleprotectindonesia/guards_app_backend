'use server';

import { createSiteSchema, CreateSiteInput, UpdateSiteInput } from '@repo/validations';
import { revalidatePath } from 'next/cache';
import { getAdminIdFromToken } from '@/lib/admin-auth';
import {
  createSiteWithPostsAndChangelog,
  updateSiteWithPostsAndChangelog,
  deleteSiteWithChangelog,
  checkSiteRelations,
  getAllSites,
} from '@repo/database';
import { ActionState } from '@/types/actions';
import { Site } from '@prisma/client';
import { serialize } from '@/lib/server-utils';
import type { Serialized } from '@/lib/server-utils';
import type { CreateSiteInput as CreateSiteInputType } from '@repo/validations';

type SitePostPayload = CreateSiteInputType['posts'][number];

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
  let postsPayload: unknown[] = [];
  try {
    postsPayload = JSON.parse((formData.get('postsPayload') as string) || '[]');
  } catch {
    return { message: 'Invalid posts payload.', success: false };
  }

  const firstPost = (postsPayload[0] as Partial<SitePostPayload> | undefined) ?? {};
  const validatedFields = createSiteSchema.safeParse({
    name: formData.get('name'),
    clientName: formData.get('clientName'),
    address: firstPost.address || formData.get('address'),
    latitude: Number(firstPost.latitude),
    longitude: Number(firstPost.longitude),
    geofenceRadius: parseFloat(formData.get('geofenceRadius') as string),
    kind: formData.get('kind') || 'fixed',
    status: formData.get('status') === 'true',
    posts: postsPayload,
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Site.',
      success: false,
    };
  }

  try {
    const { posts, ...siteData } = validatedFields.data;
    await createSiteWithPostsAndChangelog(siteData, posts, adminId!);
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to Create Site.',
      success: false,
    };
  }

  revalidatePath('/admin/sites');
  revalidatePath('/admin/guard-shifts', 'layout');
  revalidatePath('/admin/new-dashboard');
  return { success: true, message: 'Site created successfully' };
}

export async function updateSite(
  id: string,
  prevState: ActionState<UpdateSiteInput>,
  formData: FormData
): Promise<ActionState<UpdateSiteInput>> {
  const adminId = await getAdminIdFromToken();
  let postsPayload: unknown[] = [];
  try {
    postsPayload = JSON.parse((formData.get('postsPayload') as string) || '[]');
  } catch {
    return { message: 'Invalid posts payload.', success: false };
  }

  const firstPost = (postsPayload[0] as Partial<SitePostPayload> | undefined) ?? {};
  const validatedFields = createSiteSchema.safeParse({
    name: formData.get('name'),
    clientName: formData.get('clientName'),
    address: firstPost.address || formData.get('address'),
    latitude: Number(firstPost.latitude),
    longitude: Number(firstPost.longitude),
    geofenceRadius: parseFloat(formData.get('geofenceRadius') as string),
    kind: formData.get('kind') || 'fixed',
    status: formData.get('status') === 'true',
    posts: postsPayload,
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Site.',
      success: false,
    };
  }

  try {
    const { posts, ...siteData } = validatedFields.data;
    await updateSiteWithPostsAndChangelog(id, siteData, posts, adminId!);
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to Update Site.',
      success: false,
    };
  }

  revalidatePath('/admin/sites');
  revalidatePath('/admin/guard-shifts', 'layout');
  revalidatePath('/admin/new-dashboard');
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
    revalidatePath('/admin/guard-shifts', 'layout');
    revalidatePath('/admin/new-dashboard');
    return { success: true };
  } catch (error) {
    console.error('Database Error:', error);
    return { success: false, message: 'Failed to delete site' };
  }
}
