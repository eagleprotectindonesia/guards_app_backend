import { prisma } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import OfficeShiftForm from '../components/office-shift-form';

export default async function CreateOfficeShiftPage() {
  await requirePermission(PERMISSIONS.OFFICE_SHIFTS.CREATE);

  const [officeShiftTypes, employees] = await Promise.all([
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

  return <OfficeShiftForm officeShiftTypes={officeShiftTypes} employees={employees} />;
}
