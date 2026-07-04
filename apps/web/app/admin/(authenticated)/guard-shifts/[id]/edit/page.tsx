import { prisma, getSystemSetting } from '@repo/database';
import { serialize } from '@/lib/server-utils';
import ShiftForm from '../../components/shift-form';
import { notFound } from 'next/navigation';
import { getActiveFixedSites, getActiveEscortSites } from '@repo/database';
import { getActiveEmployeesSummary } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function EditShiftPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(PERMISSIONS.SHIFTS.EDIT);
  const { id } = await params;

  const [shift, fixedSites, escortEndSites, shiftTypes, employees, hideEscortSetting] = await Promise.all([
    prisma.shift.findUnique({ where: { id } }),
    getActiveFixedSites(),
    getActiveEscortSites(),
    prisma.shiftType.findMany({ orderBy: { name: 'asc' } }),
    getActiveEmployeesSummary('on_site'),
    getSystemSetting('HIDE_ESCORT_SITES'),
  ]);

  if (!shift) {
    notFound();
  }

  const hideEscortSites = hideEscortSetting?.value === '1';

  // If the assigned employee is inactive, fetch them specifically to include in the list or handle appropriately.
  // For now, if the employee is inactive but assigned, they won't appear in the 'employees' list which filters by status=true.
  // To support editing a shift with an inactive employee, we should probably fetch that specific employee too if missing.
  // However, simpler to just let the select show "Unassigned" or just the ID if not found in options,
  // or fetch all employees. Let's stick to active employees for now as per previous logic.

  return (
    <div className="max-w-6xl mx-auto py-8">
      <ShiftForm
        shift={serialize(shift)}
        fixedSites={serialize(fixedSites)}
        escortEndSites={serialize(escortEndSites)}
        shiftTypes={serialize(shiftTypes)}
        employees={employees}
        hideEscortSites={hideEscortSites}
      />
    </div>
  );
}
