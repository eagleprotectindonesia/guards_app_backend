import { db as prisma } from "../client";

export async function getSystemSetting(name: string) {
  return prisma.systemSetting.findUnique({
    where: { name },
  });
}

export async function getAllSystemSettings() {
  return prisma.systemSetting.findMany({
    orderBy: { name: 'asc' },
  });
}

export async function updateSystemSettingWithChangelog(
  name: string,
  value: string,
  adminId: string,
  note?: string
) {
  return prisma.$transaction(async tx => {
    const oldSetting = await tx.systemSetting.findUnique({
      where: { name },
    });

    const setting = await tx.systemSetting.upsert({
      where: { name },
      update: { 
        value,
        ...(note !== undefined && { note })
      },
      create: { name, value, note },
    });

    await tx.changelog.create({
      data: {
        action: 'UPDATE',
        entityType: 'SystemSetting',
        entityId: name,
        adminId: adminId,
        details: {
          name,
          oldValue: oldSetting?.value,
          newValue: value,
          oldNote: oldSetting?.note,
          newNote: note,
        },
      },
    });

    return setting;
  }, { timeout: 5000 });
}
