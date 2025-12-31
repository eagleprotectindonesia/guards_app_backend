import { serialize } from '@/lib/utils';
import ShiftTypeForm from '../../components/shift-type-form';
import { notFound } from 'next/navigation';
import { getShiftTypeById } from '@/lib/data-access/shift-types';

export const dynamic = 'force-dynamic';

export default async function EditShiftTypePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const shiftType = await getShiftTypeById(id);

  if (!shiftType) {
    notFound();
  }

  const serializedShiftType = serialize(shiftType);

  return (
    <div className="max-w-6xl mx-auto py-8">
      <ShiftTypeForm shiftType={serializedShiftType} />
    </div>
  );
}
