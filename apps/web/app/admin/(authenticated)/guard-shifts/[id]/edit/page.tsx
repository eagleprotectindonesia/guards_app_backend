import { prisma, getSystemSetting } from '@repo/database';
import { serialize } from '@/lib/server-utils';
import ShiftForm from '../../components/shift-form';
import { notFound } from 'next/navigation';
import { getActiveFixedSites, getActiveEscortSites } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function EditShiftPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(PERMISSIONS.SHIFTS.EDIT);
  const { id } = await params;

  const [shift, fixedSites, escortEndSites, shiftTypes, hideEscortSetting] = await Promise.all([
    prisma.shift.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            employeeNumber: true,
          },
        },
      },
    }),
    getActiveFixedSites(),
    getActiveEscortSites(),
    prisma.shiftType.findMany({ orderBy: { name: 'asc' } }),
    getSystemSetting('HIDE_ESCORT_SITES'),
  ]);

  if (!shift) {
    notFound();
  }

  const hideEscortSites = hideEscortSetting?.value === '1';

  return (
    <div className="max-w-6xl mx-auto py-8">
      <ShiftForm
        shift={serialize(shift)}
        fixedSites={serialize(fixedSites)}
        escortEndSites={serialize(escortEndSites)}
        shiftTypes={serialize(shiftTypes)}
        employees={[]}
        hideEscortSites={hideEscortSites}
      />
    </div>
  );
}
