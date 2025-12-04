import { prisma } from '@/lib/prisma';
import { serialize } from '@/lib/utils';
import ShiftTypeList from './components/shift-type-list';

export const dynamic = 'force-dynamic';

export default async function ShiftTypesPage() {
  const shiftTypes = await prisma.shiftType.findMany({
    orderBy: { name: 'asc' },
  });
  
  const serializedShiftTypes = serialize(shiftTypes);

  return (
    <div className="max-w-7xl mx-auto">
      <ShiftTypeList shiftTypes={serializedShiftTypes} />
    </div>
  );
}
