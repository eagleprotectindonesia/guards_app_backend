import { db as prisma } from '../prisma/client';

export interface ChangelogFeedItem {
  id: string;
  entityType: string;
  action: string;
  message: string;
  createdAt: Date;
}

export async function getLatestSystemChangelogs(limit = 5): Promise<ChangelogFeedItem[]> {
  const changelogs = await prisma.changelog.findMany({
    where: {
      entityType: {
        in: [
          'Employee',
          'employee',
          'Shift',
          'shift',
          'OfficeShift',
          'office_shift',
          'officeshift',
          'Site',
          'site',
          'Admin',
          'admin',
        ],
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
  });

  if (changelogs.length === 0) {
    return [];
  }

  // Gather entity IDs by type
  const employeeIds = new Set<string>();
  const shiftIds = new Set<string>();
  const officeShiftIds = new Set<string>();
  const siteIds = new Set<string>();
  const adminIds = new Set<string>();

  for (const c of changelogs) {
    const type = c.entityType.toLowerCase();
    if (type === 'employee') {
      employeeIds.add(c.entityId);
    } else if (type === 'shift') {
      shiftIds.add(c.entityId);
    } else if (type === 'officeshift' || type === 'office_shift') {
      officeShiftIds.add(c.entityId);
    } else if (type === 'site') {
      siteIds.add(c.entityId);
    } else if (type === 'admin') {
      adminIds.add(c.entityId);
    }
  }

  // Fetch entities concurrently
  const [employees, shifts, officeShifts, sites, admins] = await Promise.all([
    employeeIds.size > 0
      ? prisma.employee.findMany({
          where: { id: { in: Array.from(employeeIds) } },
          select: { id: true, fullName: true },
        })
      : Promise.resolve([]),
    shiftIds.size > 0
      ? prisma.shift.findMany({
          where: { id: { in: Array.from(shiftIds) } },
          select: {
            id: true,
            employee: { select: { fullName: true } },
          },
        })
      : Promise.resolve([]),
    officeShiftIds.size > 0
      ? prisma.officeShift.findMany({
          where: { id: { in: Array.from(officeShiftIds) } },
          select: {
            id: true,
            employee: { select: { fullName: true } },
          },
        })
      : Promise.resolve([]),
    siteIds.size > 0
      ? prisma.site.findMany({
          where: { id: { in: Array.from(siteIds) } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    adminIds.size > 0
      ? prisma.admin.findMany({
          where: { id: { in: Array.from(adminIds) } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  // Create lookups
  const employeeMap = new Map(employees.map(e => [e.id, e.fullName]));
  const shiftMap = new Map(shifts.map(s => [s.id, s]));
  const officeShiftMap = new Map(officeShifts.map(os => [os.id, os]));
  const siteMap = new Map(sites.map(s => [s.id, s.name]));
  const adminMap = new Map(admins.map(a => [a.id, a.name]));

  return changelogs.map(c => {
    const type = c.entityType.toLowerCase();
    const isCreate = c.action === 'CREATE' || c.action === 'BULK_CREATE';
    const actionText = isCreate ? 'created' : 'updated';

    let message = `${c.entityId} is ${actionText}`;

    if (type === 'employee') {
      const name = employeeMap.get(c.entityId) || 'Unknown Employee';
      message = `${name} is ${actionText}`;
    } else if (type === 'admin') {
      const name = adminMap.get(c.entityId) || 'Unknown Admin';
      message = `${name} is ${actionText}`;
    } else if (type === 'site') {
      const name = siteMap.get(c.entityId) || 'Unknown Site';
      message = `${name} is ${actionText}`;
    } else if (type === 'shift') {
      const shift = shiftMap.get(c.entityId);
      if (shift) {
        const empName = shift.employee?.fullName || 'unassigned';
        message = `${empName}'s shift is ${actionText}`;
      } else {
        message = `shift is ${actionText}`;
      }
    } else if (type === 'officeshift' || type === 'office_shift') {
      const officeShift = officeShiftMap.get(c.entityId);
      if (officeShift) {
        const empName = officeShift.employee?.fullName || 'Unknown Employee';
        message = `${empName}'s office shift is ${actionText}`;
      } else {
        message = `office shift is ${actionText}`;
      }
    }

    return {
      id: c.id,
      entityType: c.entityType,
      action: actionText,
      message,
      createdAt: c.createdAt,
    };
  });
}
