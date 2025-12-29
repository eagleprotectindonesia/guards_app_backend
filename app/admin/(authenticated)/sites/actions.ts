'use server';

import { prisma } from '@/lib/prisma';
import { createSiteSchema } from '@/lib/validations';
import { revalidatePath } from 'next/cache';
import { getAdminIdFromToken } from '@/lib/admin-auth';

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
    await prisma.$transaction(async tx => {
      const createdSite = await tx.site.create({
        data: {
          ...validatedFields.data,
          lastUpdatedById: adminId,
        },
      });

      await tx.changelog.create({
        data: {
          action: 'CREATE',
          entityType: 'Site',
          entityId: createdSite.id,
          adminId: adminId,
          details: {
            name: createdSite.name,
            clientName: createdSite.clientName,
            address: createdSite.address,
            latitude: createdSite.latitude,
            longitude: createdSite.longitude,
          },
        },
      });
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
    await prisma.$transaction(async tx => {
      const updatedSite = await tx.site.update({
        where: { id },
        data: {
          ...validatedFields.data,
          lastUpdatedById: adminId,
        },
      });

      await tx.changelog.create({
        data: {
          action: 'UPDATE',
          entityType: 'Site',
          entityId: updatedSite.id,
          adminId: adminId,
          details: {
            ...validatedFields.data,
            name: updatedSite.name, // Ensure name is always present
          },
        },
      });
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
    const adminId = await getAdminIdFromToken();
    const relatedShifts = await prisma.shift.findFirst({
      where: { siteId: id },
    });

    if (relatedShifts) {
      return { success: false, message: 'Cannot delete site: It has associated shifts.' };
    }

    const relatedAlerts = await prisma.alert.findFirst({
      where: { siteId: id },
    });

    if (relatedAlerts) {
      return { success: false, message: 'Cannot delete site: It has associated alerts.' };
    }

    await prisma.$transaction(async tx => {
      const siteToDelete = await tx.site.findUnique({
        where: { id },
        select: { name: true, clientName: true },
      });

      await tx.site.delete({
        where: { id },
      });

      if (siteToDelete) {
        await tx.changelog.create({
          data: {
            action: 'DELETE',
            entityType: 'Site',
            entityId: id,
            adminId: adminId,
            details: {
              name: siteToDelete.name,
              clientName: siteToDelete.clientName,
              deletedAt: new Date(),
            },
          },
        });
      }
    });

    revalidatePath('/admin/sites');
    return { success: true };
  } catch (error) {
    console.error('Database Error:', error);
    return { success: false, message: 'Failed to delete site' };
  }
}
