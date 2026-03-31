import { notFound } from 'next/navigation';
import { prisma, getOfficeShiftById } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import OfficeShiftForm from '../../components/office-shift-form';

export default async function EditOfficeShiftPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(PERMISSIONS.OFFICE_SHIFTS.EDIT);
  const { id } = await params;

  const [officeShift, officeShiftTypes, employees] = await Promise.all([
    getOfficeShiftById(id),
    prisma.officeShiftType.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } }),
    prisma.employee.findMany({
      where: {
        status: true,
        deletedAt: null,
        role: 'office',
        officeAttendanceMode: 'shift_based',
      },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, employeeNumber: true },
    }),
  ]);

  if (!officeShift) {
    notFound();
  }

  return (
    <OfficeShiftForm
      officeShift={{
        id: officeShift.id,
        officeShiftTypeId: officeShift.officeShiftTypeId,
        employeeId: officeShift.employeeId,
        date: officeShift.date.toISOString(),
        startsAt: officeShift.startsAt.toISOString(),
        endsAt: officeShift.endsAt.toISOString(),
        status: officeShift.status,
        graceMinutes: officeShift.graceMinutes,
        note: officeShift.note,
      }}
      officeShiftTypes={officeShiftTypes}
      employees={employees}
    />
  );
}
