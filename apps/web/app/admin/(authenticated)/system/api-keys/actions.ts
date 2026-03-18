'use server';

import { prisma } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { generateApiKey, hashApiKey } from '@/lib/api-key';
import { revalidatePath } from 'next/cache';

export async function createApiKey(name: string) {
  await requirePermission(PERMISSIONS.SYSTEM.EDIT_SETTINGS);

  const rawKey = generateApiKey();
  const hashedKey = hashApiKey(rawKey);

  await prisma.apiKey.create({
    data: {
      name,
      key: hashedKey,
    },
  });

  revalidatePath('/admin/system/api-keys');

  // Return the raw key ONLY once so the admin can copy it
  return { rawKey };
}

export async function toggleApiKeyStatus(id: string, currentStatus: boolean) {
  await requirePermission(PERMISSIONS.SYSTEM.EDIT_SETTINGS);

  await prisma.apiKey.update({
    where: { id },
    data: { status: !currentStatus },
  });

  revalidatePath('/admin/system/api-keys');
}

export async function deleteApiKey(id: string) {
  await requirePermission(PERMISSIONS.SYSTEM.EDIT_SETTINGS);

  await prisma.apiKey.delete({
    where: { id },
  });

  revalidatePath('/admin/system/api-keys');
}
