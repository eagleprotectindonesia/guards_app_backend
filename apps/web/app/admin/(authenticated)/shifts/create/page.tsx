import { prisma } from '@repo/database';
import { serialize } from '@/lib/utils';
import ShiftForm from '../components/shift-form';
import { getActiveSites } from '@repo/database';
import { getActiveEmployeesSummary } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function CreateShiftPage() {
  await requirePermission(PERMISSIONS.SHIFTS.CREATE);
  const [sites, shiftTypes, employees] = await Promise.all([
    getActiveSites(),
    prisma.shiftType.findMany({ orderBy: { name: 'asc' } }),
    getActiveEmployeesSummary('on_site'),
  ]);

  return (
    <div className="max-w-6xl mx-auto py-8">
      <ShiftForm sites={serialize(sites)} shiftTypes={serialize(shiftTypes)} employees={employees} />
    </div>
  );
}
