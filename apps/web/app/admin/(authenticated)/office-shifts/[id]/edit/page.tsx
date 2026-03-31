import { notFound } from 'next/navigation';
import { prisma, getActiveEmployeesSummary, getOfficeShiftById } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import OfficeShiftForm from '../../components/office-shift-form';

export default async function EditOfficeShiftPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(PERMISSIONS.OFFICE_SHIFTS.EDIT);
  const { id } = await params;

  const [officeShift, officeShiftTypes, employees] = await Promise.all([
    getOfficeShiftById(id),
    prisma.officeShiftType.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } }),
    getActiveEmployeesSummary('office', 'shift_based'),
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
        note: officeShift.note,
      }}
      officeShiftTypes={officeShiftTypes}
      employees={employees}
    />
  );
}
