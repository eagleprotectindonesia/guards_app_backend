'use server';

import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { createRegeneratedShiftPhotoReport } from '@repo/database';
import { revalidatePath } from 'next/cache';

export async function regenerateShiftPhotoReport(formData: FormData) {
  const session = await requirePermission(PERMISSIONS.SHIFT_PHOTO_REPORTS.CREATE);

  const reportId = formData.get('id')?.toString();
  if (!reportId) throw new Error('Missing report id');

  await createRegeneratedShiftPhotoReport({ originalReportId: reportId, adminId: session.id });
  revalidatePath('/admin/shift-photo-reports');
}
