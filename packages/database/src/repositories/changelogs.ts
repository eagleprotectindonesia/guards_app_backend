import { db as prisma } from '../prisma/client';

export interface ChangelogFeedItem {
  id: string;
  entityType: string;
  action: string;
  message: string;
  createdAt: Date;
  iconKey: 'memo' | 'guard-report' | 'ticket' | 'employee' | 'site' | 'shift' | 'office-shift' | 'admin' | 'other';
  iconAccent: 'emerald' | 'amber' | 'sky' | 'purple' | 'rose' | 'neutral';
}

type RawChangelogItem = {
  id: string;
  entityType: string;
  action: string;
  message: string;
  createdAt: Date;
  iconKey: ChangelogFeedItem['iconKey'];
  iconAccent: ChangelogFeedItem['iconAccent'];
};

function mapIcon(entityType: string): { iconKey: ChangelogFeedItem['iconKey']; iconAccent: ChangelogFeedItem['iconAccent'] } {
  const t = entityType.toLowerCase();
  if (t === 'officememo') return { iconKey: 'memo', iconAccent: 'emerald' };
  if (t === 'shiftphotoreport') return { iconKey: 'guard-report', iconAccent: 'emerald' };
  if (t === 'ticket') return { iconKey: 'ticket', iconAccent: 'amber' };
  if (t === 'employee') return { iconKey: 'employee', iconAccent: 'sky' };
  if (t === 'site') return { iconKey: 'site', iconAccent: 'purple' };
  if (t === 'shift') return { iconKey: 'shift', iconAccent: 'sky' };
  if (t === 'officeshift' || t === 'office_shift') return { iconKey: 'office-shift', iconAccent: 'neutral' };
  if (t === 'admin') return { iconKey: 'admin', iconAccent: 'neutral' };
  return { iconKey: 'other', iconAccent: 'neutral' };
}

export async function getLatestSystemChangelogs(
  limit = 5,
  start?: Date,
  end?: Date
): Promise<ChangelogFeedItem[]> {
  const where: any = {
    entityType: {
      in: [
        'Employee', 'employee',
        'Shift', 'shift',
        'OfficeShift', 'office_shift', 'officeshift',
        'Site', 'site',
        'Admin', 'admin',
        'OfficeMemo', 'officeMemo', 'officememo',
        'ShiftPhotoReport', 'shiftPhotoReport', 'shiftphotoreport',
      ],
    },
  };

  if (start || end) {
    where.createdAt = {};
    if (start) where.createdAt.gte = start;
    if (end) where.createdAt.lt = end;
  }

  const changelogs = await prisma.changelog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 10,
  });

  // Ticket close events from TicketHistory (no changelog entries for tickets)
  let ticketClosedItems: RawChangelogItem[] = [];
  if (start || end) {
    const ticketHistoryWhere: any = { action: 'STATUS_CHANGED', toValue: 'CLOSED' };
    if (start || end) {
      ticketHistoryWhere.createdAt = {};
      if (start) ticketHistoryWhere.createdAt.gte = start;
      if (end) ticketHistoryWhere.createdAt.lt = end;
    }

    const closedHistory = await prisma.ticketHistory.findMany({
      where: ticketHistoryWhere,
      select: { id: true, ticketId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: limit + 10,
    });

    if (closedHistory.length > 0) {
      const ticketIds = [...new Set(closedHistory.map(h => h.ticketId))];
      const tickets = await prisma.ticket.findMany({
        where: { id: { in: ticketIds } },
        select: { id: true, code: true },
      });
      const ticketMap = new Map(tickets.map(t => [t.id, t.code]));

      ticketClosedItems = closedHistory.map(h => {
        const code = ticketMap.get(h.ticketId) ?? `#${h.ticketId.slice(0, 8)}`;
        return {
          id: h.id,
          entityType: 'Ticket',
          action: 'closed',
          message: `CS closed ticket ${code}`,
          createdAt: h.createdAt,
          ...mapIcon('Ticket'),
        };
      });
    }
  }

  if (changelogs.length === 0 && ticketClosedItems.length === 0) {
    return [];
  }

  // Gather entity IDs by type
  const employeeIds = new Set<string>();
  const shiftIds = new Set<string>();
  const officeShiftIds = new Set<string>();
  const siteIds = new Set<string>();
  const adminIds = new Set<string>();
  const memoIds = new Set<string>();
  const reportIds = new Set<string>();

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
    } else if (type === 'officememo') {
      memoIds.add(c.entityId);
    } else if (type === 'shiftphotoreport') {
      reportIds.add(c.entityId);
    }
  }

  // Fetch entities concurrently
  const [employees, shifts, officeShifts, sites, admins, memos] = await Promise.all([
    employeeIds.size > 0
      ? prisma.employee.findMany({
          where: { id: { in: Array.from(employeeIds) } },
          select: { id: true, fullName: true },
        })
      : Promise.resolve([] as { id: string; fullName: string }[]),
    shiftIds.size > 0
      ? prisma.shift.findMany({
          where: { id: { in: Array.from(shiftIds) } },
          select: { id: true, employee: { select: { fullName: true } } },
        })
      : Promise.resolve([] as { id: string; employee: { fullName: string } | null }[]),
    officeShiftIds.size > 0
      ? prisma.officeShift.findMany({
          where: { id: { in: Array.from(officeShiftIds) } },
          select: { id: true, employee: { select: { fullName: true } } },
        })
      : Promise.resolve([] as { id: string; employee: { fullName: string } | null }[]),
    siteIds.size > 0
      ? prisma.site.findMany({
          where: { id: { in: Array.from(siteIds) } },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
    adminIds.size > 0
      ? prisma.admin.findMany({
          where: { id: { in: Array.from(adminIds) } },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
    memoIds.size > 0
      ? prisma.officeMemo.findMany({
          where: { id: { in: Array.from(memoIds) } },
          select: { id: true, title: true },
        })
      : Promise.resolve([] as { id: string; title: string }[]),
  ]);

  // Create lookups
  const employeeMap = new Map(employees.map(e => [e.id, e.fullName]));
  const shiftMap = new Map(shifts.map(s => [s.id, s]));
  const officeShiftMap = new Map(officeShifts.map(os => [os.id, os]));
  const siteMap = new Map(sites.map(s => [s.id, s.name]));
  const adminMap = new Map(admins.map(a => [a.id, a.name]));
  const memoMap = new Map(memos.map(m => [m.id, m.title]));

  const isCreate = (action: string) => action === 'CREATE' || action === 'BULK_CREATE';
  const isUpdate = (action: string) => action === 'UPDATE';

  const items: RawChangelogItem[] = [];

  for (const c of changelogs) {
    const type = c.entityType.toLowerCase();
    const actionText =
      isCreate(c.action) ? 'created'
      : isUpdate(c.action) && type === 'shiftphotoreport' ? 'submitted'
      : isUpdate(c.action) ? 'updated'
      : c.action.toLowerCase();

    let message = `${c.entityId} is ${actionText}`;
    const meta = mapIcon(c.entityType);

    if (type === 'employee') {
      const name = employeeMap.get(c.entityId);
      message = name ? `${name} is ${actionText}` : `Employee is ${actionText}`;
    } else if (type === 'admin') {
      const name = adminMap.get(c.entityId);
      message = name ? `${name} is ${actionText}` : `Admin is ${actionText}`;
    } else if (type === 'site') {
      const name = siteMap.get(c.entityId);
      message = name ? `${name} is ${actionText}` : `Site is ${actionText}`;
    } else if (type === 'shift') {
      const shift = shiftMap.get(c.entityId);
      const empName = shift?.employee?.fullName || 'unassigned';
      message = `${empName}'s shift is ${actionText}`;
    } else if (type === 'officeshift' || type === 'office_shift') {
      const officeShift = officeShiftMap.get(c.entityId);
      const empName = officeShift?.employee?.fullName || 'Unknown Employee';
      message = `${empName}'s office shift is ${actionText}`;
    } else if (type === 'officememo') {
      const title = memoMap.get(c.entityId);
      if (isCreate(c.action)) {
        message = title
          ? `New memo created: "${title}"`
          : 'New memo created';
      } else {
        message = title
          ? `Memo updated: "${title}"`
          : 'Memo updated';
      }
    } else if (type === 'shiftphotoreport') {
      if (isCreate(c.action)) {
        message = 'Guard report submitted';
      } else if (c.details && typeof c.details === 'object' && 'status' in (c.details as any)) {
        const status = (c.details as any).status;
        message = status === 'generated' ? 'Guard report generated'
          : status === 'failed' ? 'Guard report failed'
          : 'Guard report updated';
      }
    }

    items.push({ id: c.id, entityType: c.entityType, action: actionText, message, createdAt: c.createdAt, ...meta });
  }

  // Merge changelog items with ticket closed items, sort desc by createdAt, take limit
  const merged = [...items, ...ticketClosedItems];
  merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return merged.slice(0, limit);
}
