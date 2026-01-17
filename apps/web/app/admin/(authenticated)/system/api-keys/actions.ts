'use server';

import { prisma } from '@/lib/prisma';
import { checkSuperAdmin } from '@/lib/admin-auth';
import { generateApiKey, hashApiKey } from '@/lib/api-key';
import { revalidatePath } from 'next/cache';

export async function createApiKey(name: string) {
  const session = await checkSuperAdmin();
  if (!session) {
    throw new Error('Unauthorized: Superadmin only');
  }

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
  const session = await checkSuperAdmin();
  if (!session) {
    throw new Error('Unauthorized: Superadmin only');
  }

  await prisma.apiKey.update({
    where: { id },
    data: { status: !currentStatus },
  });

  revalidatePath('/admin/system/api-keys');
}

export async function deleteApiKey(id: string) {
  const session = await checkSuperAdmin();
  if (!session) {
    throw new Error('Unauthorized: Superadmin only');
  }

  await prisma.apiKey.delete({
    where: { id },
  });

  revalidatePath('/admin/system/api-keys');
}
