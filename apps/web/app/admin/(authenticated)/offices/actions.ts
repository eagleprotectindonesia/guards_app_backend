'use server';

import { UpdateOfficeInput, updateOfficeSchema } from '@/lib/validations';
import { revalidatePath } from 'next/cache';
import { getAdminIdFromToken } from '@/lib/admin-auth';
import {
  updateOfficeWithChangelog,
  deleteOfficeWithChangelog,
  checkOfficeRelations,
  getAllOffices,
} from '@/lib/data-access/offices';
import { ActionState } from '@/types/actions';
import { Office } from '@prisma/client';
import { serialize, Serialized } from '@/lib/utils';

export async function getAllOfficesForExport(): Promise<
  Serialized<Office & { lastUpdatedBy?: { name: string } | null; createdBy?: { name: string } | null }>[]
> {
  const offices = await getAllOffices(true);
  return serialize(offices);
}

export async function updateOffice(
  id: string,
  prevState: ActionState<UpdateOfficeInput>,
  formData: FormData
): Promise<ActionState<UpdateOfficeInput>> {
  const adminId = await getAdminIdFromToken();
  const validatedFields = updateOfficeSchema.safeParse({
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

export async function deleteOffice(id: string) {
  try {
    const adminId = await getAdminIdFromToken();
    const { hasAttendance } = await checkOfficeRelations(id);

    if (hasAttendance) {
      return { success: false, message: 'Cannot delete office: It has associated attendance records.' };
    }

    await deleteOfficeWithChangelog(id, adminId!);

    revalidatePath('/admin/offices');
    return { success: true };
  } catch (error) {
    console.error('Database Error:', error);
    return { success: false, message: 'Failed to delete office' };
  }
}
