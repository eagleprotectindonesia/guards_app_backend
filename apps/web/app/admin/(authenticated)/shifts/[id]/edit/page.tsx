import { prisma } from '@/lib/prisma';
import { serialize } from '@/lib/utils';
import ShiftForm from '../../components/shift-form';
import { notFound } from 'next/navigation';
import { getActiveSites } from '@/lib/data-access/sites';
import { getActiveGuards } from '@/lib/data-access/guards';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function EditShiftPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(PERMISSIONS.SHIFTS.EDIT);
  const { id } = await params;

  const [shift, sites, shiftTypes, guards] = await Promise.all([
    prisma.shift.findUnique({ where: { id } }),
    getActiveSites(),
    prisma.shiftType.findMany({ orderBy: { name: 'asc' } }),
    getActiveGuards(),
  ]);

  if (!shift) {
    notFound();
  }

  // If the assigned guard is inactive, fetch them specifically to include in the list or handle appropriately.
  // For now, if the guard is inactive but assigned, they won't appear in the 'guards' list which filters by status=true.
  // To support editing a shift with an inactive guard, we should probably fetch that specific guard too if missing.
  // However, simpler to just let the select show "Unassigned" or just the ID if not found in options,
  // or fetch all guards. Let's stick to active guards for now as per previous logic.

  return (
    <div className="max-w-6xl mx-auto py-8">
      <ShiftForm
        shift={serialize(shift)}
        sites={serialize(sites)}
        shiftTypes={serialize(shiftTypes)}
        guards={serialize(guards)}
      />
    </div>
  );
}
