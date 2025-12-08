import { prisma } from '@/lib/prisma';
import { serialize } from '@/lib/utils';
import ShiftTypeForm from '../../components/shift-type-form';
import { notFound } from 'next/navigation';

export default async function EditShiftTypePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const shiftType = await prisma.shiftType.findUnique({
    where: { id },
  });

  if (!shiftType) {
    notFound();
  }

  const serializedShiftType = serialize(shiftType);

  return (
    <div className="max-w-4xl mx-auto py-8">
      <ShiftTypeForm shiftType={serializedShiftType} />
    </div>
  );
}
