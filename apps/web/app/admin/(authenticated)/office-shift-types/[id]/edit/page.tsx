import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getOfficeShiftTypeById } from '@repo/database';
import OfficeShiftTypeForm from '../../components/office-shift-type-form';

export default async function EditOfficeShiftTypePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(PERMISSIONS.OFFICE_SHIFT_TYPES.EDIT);
  const { id } = await params;
  const officeShiftType = await getOfficeShiftTypeById(id);

  if (!officeShiftType) {
    notFound();
  }

  return (
    <OfficeShiftTypeForm
      officeShiftType={{
        id: officeShiftType.id,
        name: officeShiftType.name,
        startTime: officeShiftType.startTime,
        endTime: officeShiftType.endTime,
        createdAt: officeShiftType.createdAt.toISOString(),
        updatedAt: officeShiftType.updatedAt.toISOString(),
      }}
    />
  );
}
