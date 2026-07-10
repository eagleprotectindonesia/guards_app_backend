import { prisma, getGroupShiftDetail, getSystemSetting } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { notFound } from 'next/navigation';
import GuardShiftsTabs from '../../components/guard-shifts-tabs';
import GroupShiftDetail from '../../components/group-shift-detail';

export const dynamic = 'force-dynamic';

export default async function GroupShiftDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(PERMISSIONS.SHIFTS.VIEW);
  const { id } = await params;

  const [groupShift, hideEscortSetting] = await Promise.all([
    getGroupShiftDetail(id),
    getSystemSetting('HIDE_ESCORT_SITES'),
  ]);
  if (!groupShift) notFound();
  const hideEscortSites = hideEscortSetting?.value === '1';

  const allAdmins = await prisma.admin.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });
  const employees = await prisma.employee.findMany({
    where: { deletedAt: null, role: 'on_site' },
    select: { id: true, fullName: true, employeeNumber: true },
    orderBy: { fullName: 'asc' },
  });

  const excludedEmployeeIds = groupShift.shifts.map(s => s.employeeId).filter(Boolean) as string[];
  const availableEmployees = employees.filter(e => !excludedEmployeeIds.includes(e.id));

  return (
    <div className="max-w-5xl mx-auto">
      <GuardShiftsTabs />
      <GroupShiftDetail
        groupShift={groupShift}
        admins={allAdmins}
        availableEmployees={availableEmployees}
        hideEscortSites={hideEscortSites}
      />
    </div>
  );
}
