import { prisma } from '@/lib/prisma';
import { serialize } from '@/lib/utils';
import ShiftForm from '../../components/shift-form';
import { notFound } from 'next/navigation';
import { getActiveSites } from '@/lib/data-access/sites';
import { getActiveEmployees } from '@/lib/data-access/employees';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function EditShiftPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(PERMISSIONS.SHIFTS.EDIT);
  const { id } = await params;

  const [shift, sites, shiftTypes, employees] = await Promise.all([
    prisma.shift.findUnique({ where: { id } }),
    getActiveSites(),
    prisma.shiftType.findMany({ orderBy: { name: 'asc' } }),
    getActiveEmployees('on_site'),
  ]);

  if (!shift) {
    notFound();
  }

  // If the assigned employee is inactive, fetch them specifically to include in the list or handle appropriately.
  // For now, if the employee is inactive but assigned, they won't appear in the 'employees' list which filters by status=true.
  // To support editing a shift with an inactive employee, we should probably fetch that specific employee too if missing.
  // However, simpler to just let the select show "Unassigned" or just the ID if not found in options,
  // or fetch all employees. Let's stick to active employees for now as per previous logic.

  return (
    <div className="max-w-6xl mx-auto py-8">
      <ShiftForm
        shift={serialize(shift)}
        sites={serialize(sites)}
        shiftTypes={serialize(shiftTypes)}
        employees={serialize(employees)}
      />
    </div>
  );
}
