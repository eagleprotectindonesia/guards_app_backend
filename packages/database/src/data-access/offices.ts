import { db as prisma } from '../client';
import { Prisma } from '@prisma/client';
import { ExternalEmployee } from '../external-employee-api';

export async function getAllOffices(includeDeleted = false) {
  return prisma.office.findMany({
    where: includeDeleted ? {} : { deletedAt: null },
    orderBy: { name: 'asc' },
    include: {
      lastUpdatedBy: {
        select: {
          name: true,
        },
      },
      createdBy: {
        select: {
          name: true,
        },
      },
    },
  });
}

export async function getActiveOffices() {
  return prisma.office.findMany({
    where: { status: true, deletedAt: null },
    orderBy: { name: 'asc' },
  });
}

export async function getPaginatedOffices(params: { query?: string; skip: number; take: number }) {
  const { query, skip, take } = params;

  const where: Prisma.OfficeWhereInput = {
    deletedAt: null,
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { address: { contains: query, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [offices, totalCount] = await prisma.$transaction(
    async tx => {
      return Promise.all([
        tx.office.findMany({
          where,
          orderBy: { name: 'asc' },
          skip,
          take,
          include: {
            lastUpdatedBy: {
              select: {
                name: true,
              },
            },
            createdBy: {
              select: {
                name: true,
              },
            },
          },
        }),
        tx.office.count({ where }),
      ]);
    },
    { timeout: 5000 }
  );

  return { offices, totalCount };
}

export async function getOfficeById(id: string) {
  return prisma.office.findUnique({
    where: { id, deletedAt: null },
  });
}

export const OFFICE_TRACKED_FIELDS = ['name', 'address', 'latitude', 'longitude', 'status', 'note'] as const;

export async function createOfficeWithChangelog(data: Prisma.OfficeCreateInput, adminId: string) {
  return prisma.$transaction(
    async tx => {
      const createdOffice = await tx.office.create({
        data: {
          ...data,
          lastUpdatedBy: { connect: { id: adminId } },
          createdBy: { connect: { id: adminId } },
        },
      });

      await tx.changelog.create({
        data: {
          action: 'CREATE',
          entityType: 'Office',
          entityId: createdOffice.id,
          actor: 'admin',
          actorId: adminId,
          details: {
            name: createdOffice.name,
            address: createdOffice.address,
            latitude: createdOffice.latitude,
            longitude: createdOffice.longitude,
            note: createdOffice.note,
          },
        },
      });

      return createdOffice;
    },
    { timeout: 5000 }
  );
}

export async function updateOfficeWithChangelog(id: string, data: Prisma.OfficeUpdateInput, adminId: string) {
  return prisma.$transaction(
    async tx => {
      const beforeOffice = await tx.office.findUnique({
        where: { id, deletedAt: null },
      });

      if (!beforeOffice) {
        throw new Error('Office not found');
      }

      const updatedOffice = await tx.office.update({
        where: { id, deletedAt: null },
        data: {
          ...data,
          lastUpdatedBy: { connect: { id: adminId } },
        },
      });

      // Calculate changes
      const changes: Record<string, { from: any; to: any }> = {};

      for (const field of OFFICE_TRACKED_FIELDS) {
        const oldValue = (beforeOffice as any)[field];
        const newValue = (updatedOffice as any)[field];

        if (oldValue !== newValue) {
          changes[field] = { from: oldValue, to: newValue };
        }
      }

      await tx.changelog.create({
        data: {
          action: 'UPDATE',
          entityType: 'Office',
          entityId: updatedOffice.id,
          actor: 'admin',
          actorId: adminId,
          details: {
            name: updatedOffice.name,
            address: updatedOffice.address,
            latitude: updatedOffice.latitude,
            longitude: updatedOffice.longitude,
            status: updatedOffice.status,
            note: updatedOffice.note,
            changes: Object.keys(changes).length > 0 ? changes : undefined,
          },
        },
      });

      return updatedOffice;
    },
    { timeout: 5000 }
  );
}

/**
 * Sync offices from external employee data.
 * The external system is the source of truth for office id, name, and status.
 * Admin-editable fields (address, latitude, longitude, note) are never overwritten.
 * All changes are recorded in the changelog with actor=system.
 */
export async function syncOfficesFromExternalEmployees(
  employees: ExternalEmployee[]
): Promise<{ added: number; updated: number; deactivated: number }> {
  // 1. Extract unique offices from employee data (non-null office_id and office_name only)
  const officeMap = new Map<string, string>(); // office_id → office_name
  for (const emp of employees) {
    if (emp.office_id && emp.office_name && !officeMap.has(emp.office_id)) {
      officeMap.set(emp.office_id, emp.office_name);
    }
  }

  const externalOfficeIds = Array.from(officeMap.keys());
  console.log(`[SyncOffices] Found ${externalOfficeIds.length} unique offices in external data`);

  // 2. Load existing offices for change detection
  const existingOffices = await prisma.office.findMany({
    where: { id: { in: externalOfficeIds } },
  });
  const existingMap = new Map(existingOffices.map(o => [o.id, o]));

  let addedCount = 0;
  let updatedCount = 0;

  // 3. Upsert each external office
  for (const [officeId, officeName] of officeMap) {
    const existing = existingMap.get(officeId);

    if (!existing) {
      // New office — create and log
      await prisma.$transaction(async tx => {
        const created = await tx.office.create({
          data: {
            id: officeId,
            name: officeName,
            status: true,
          },
        });

        await tx.changelog.create({
          data: {
            action: 'CREATE',
            entityType: 'Office',
            entityId: created.id,
            actor: 'system',
            actorId: null,
            details: {
              name: created.name,
              status: true,
              source: 'external_employee_sync',
            },
          },
        });
      });
      addedCount++;
    } else {
      // Existing office — check for changes to externally-owned fields only
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      const updateData: Record<string, unknown> = {};

      if (existing.name !== officeName) {
        changes.name = { from: existing.name, to: officeName };
        updateData.name = officeName;
      }

      // Record update timestamp for every touched record
      updateData.updatedAt = new Date();

      // Reactivate if previously deactivated
      if (existing.status === false || existing.deletedAt !== null) {
        changes.status = { from: existing.status, to: true };
        updateData.status = true;
        updateData.deletedAt = null;
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.$transaction(async tx => {
          await tx.office.update({
            where: { id: officeId },
            data: updateData,
          });

          await tx.changelog.create({
            data: {
              action: 'UPDATE',
              entityType: 'Office',
              entityId: officeId,
              actor: 'system',
              actorId: null,
              details: {
                name: officeName,
                changes: changes as any,
                source: 'external_employee_sync',
              },
            },
          });
        });
        updatedCount++;
      }
    }
  }

  // 4. Deactivate offices no longer in the external list
  const toDeactivate = await prisma.office.findMany({
    where: {
      id: { notIn: externalOfficeIds },
      status: true,
      deletedAt: null,
    },
    select: { id: true, name: true },
  });

  for (const office of toDeactivate) {
    await prisma.$transaction(async tx => {
      await tx.office.update({
        where: { id: office.id },
        data: { status: false, deletedAt: new Date() },
      });

      await tx.changelog.create({
        data: {
          action: 'UPDATE',
          entityType: 'Office',
          entityId: office.id,
          actor: 'system',
          actorId: null,
          details: {
            name: office.name,
            changes: {
              status: { from: true, to: false },
              reason: 'External sync deactivation',
            } as any,
            source: 'external_employee_sync',
          },
        },
      });
    });
  }

  console.log(
    `[SyncOffices] Sync completed: ${addedCount} added, ${updatedCount} updated, ${toDeactivate.length} deactivated`
  );

  return { added: addedCount, updated: updatedCount, deactivated: toDeactivate.length };
}
