import ShiftTypeForm from '../../components/shift-type-form';
import { notFound } from 'next/navigation';
import { getShiftTypeById } from '@/lib/data-access/shift-types';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { SerializedShiftTypeWithAdminInfoDto } from '@/types/shift-types';

export const dynamic = 'force-dynamic';

export default async function EditShiftTypePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(PERMISSIONS.SHIFT_TYPES.EDIT);
  const { id } = await params;

  const shiftType = await getShiftTypeById(id);

  if (!shiftType) {
    notFound();
  }

  const serializedShiftType: Omit<
    SerializedShiftTypeWithAdminInfoDto,
    'createdBy' | 'lastUpdatedBy'
  > = {
    id: shiftType.id,
    name: shiftType.name,
    startTime: shiftType.startTime,
    endTime: shiftType.endTime,
    createdAt: shiftType.createdAt.toISOString(),
    updatedAt: shiftType.updatedAt.toISOString(),
  };

  return (
    <div className="max-w-6xl mx-auto py-8">
      <ShiftTypeForm shiftType={serializedShiftType} />
    </div>
  );
}
