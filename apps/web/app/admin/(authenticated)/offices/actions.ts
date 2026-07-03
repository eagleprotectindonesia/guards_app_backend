'use server';

import { CreateOfficeInput, UpdateOfficeInput, createOfficeSchema, updateOfficeSchema } from '@repo/validations';
import { revalidatePath } from 'next/cache';
import { getAdminIdFromToken } from '@/lib/admin-auth';
import { createOfficeWithChangelog, updateOfficeWithChangelog, getAllOffices, deleteOfficeWithChangelog } from '@repo/database';
import { ActionState } from '@/types/actions';
import { Office } from '@prisma/client';
import { serialize } from '@/lib/server-utils';
import type { Serialized } from '@/lib/server-utils';

export async function getAllOfficesForExport(): Promise<
  Serialized<Office & { lastUpdatedBy?: { name: string } | null; createdBy?: { name: string } | null }>[]
> {
  const offices = await getAllOffices(true);
  return serialize(offices);
}

export async function createOffice(
  prevState: ActionState<CreateOfficeInput>,
  formData: FormData
): Promise<ActionState<CreateOfficeInput>> {
  const adminId = await getAdminIdFromToken();

  const validatedFields = createOfficeSchema.safeParse({
    name: formData.get('name'),
    address: formData.get('address') || undefined,
    latitude: formData.get('latitude') ? parseFloat(formData.get('latitude') as string) : undefined,
    longitude: formData.get('longitude') ? parseFloat(formData.get('longitude') as string) : undefined,
    status: formData.get('status') === 'true',
    note: formData.get('note') || undefined,
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Office.',
      success: false,
    };
  }

  try {
    await createOfficeWithChangelog(validatedFields.data, adminId!);
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to Create Office.',
      success: false,
    };
  }

  revalidatePath('/admin/offices');
  return { success: true, message: 'Office created successfully' };
}

export async function updateOffice(
  id: string,
  prevState: ActionState<UpdateOfficeInput>,
  formData: FormData
): Promise<ActionState<UpdateOfficeInput>> {
  const adminId = await getAdminIdFromToken();
  const validatedFields = updateOfficeSchema.safeParse({
    name: formData.get('name') || undefined,
    address: formData.get('address') || undefined,
    latitude: formData.get('latitude') ? parseFloat(formData.get('latitude') as string) : undefined,
    longitude: formData.get('longitude') ? parseFloat(formData.get('longitude') as string) : undefined,
    note: formData.get('note') || undefined,
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Office.',
      success: false,
    };
  }

  try {
    await updateOfficeWithChangelog(id, validatedFields.data, adminId!);
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to Update Office.',
      success: false,
    };
  }

  revalidatePath('/admin/offices');
  return { success: true, message: 'Office updated successfully' };
}

export async function deleteOffice(id: string): Promise<{ success: boolean; message: string }> {
  const adminId = await getAdminIdFromToken();
  if (!adminId) return { success: false, message: 'Unauthorized' };

  try {
    await deleteOfficeWithChangelog(id, adminId);
  } catch (error) {
    console.error('Database Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Database Error: Failed to delete office.',
    };
  }

  revalidatePath('/admin/offices');
  return { success: true, message: 'Office deleted successfully' };
}
