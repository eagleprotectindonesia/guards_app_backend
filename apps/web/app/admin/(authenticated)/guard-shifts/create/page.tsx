import { prisma } from '@repo/database';
import { serialize } from '@/lib/server-utils';
import ScheduleBuilder from '../components/schedule-builder';
import { getActiveFixedSites, getActiveEscortSites } from '@repo/database';
import { getActiveEmployeesSummary } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function CreateShiftPage() {
  await requirePermission(PERMISSIONS.SHIFTS.CREATE);
  const [fixedSites, escortEndSites, shiftTypes, employees] = await Promise.all([
    getActiveFixedSites(),
    getActiveEscortSites(),
    prisma.shiftType.findMany({ orderBy: { name: 'asc' } }),
    getActiveEmployeesSummary('on_site'),
  ]);

  return (
    <div className="max-w-6xl mx-auto py-8">
      <ScheduleBuilder fixedSites={serialize(fixedSites)} escortEndSites={serialize(escortEndSites)} shiftTypes={serialize(shiftTypes)} employees={employees} />
    </div>
  );
}
