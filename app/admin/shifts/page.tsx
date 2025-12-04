import { prisma } from '@/lib/prisma';
import { serialize } from '@/lib/utils';
import ShiftList from './components/shift-list';

export const dynamic = 'force-dynamic';

export default async function ShiftsPage() {
  const shifts = await prisma.shift.findMany({
    include: { site: true, shiftType: true, guard: true },
    orderBy: { startsAt: 'desc' },
    take: 100,
  });

  const sites = await prisma.site.findMany({ orderBy: { name: 'asc' } });
  const shiftTypes = await prisma.shiftType.findMany({ orderBy: { name: 'asc' } });
  const guards = await prisma.guard.findMany({ 
    where: { status: true }, 
    orderBy: { name: 'asc' } 
  });

  const serializedShifts = serialize(shifts);
  const serializedSites = serialize(sites);
  const serializedShiftTypes = serialize(shiftTypes);
  const serializedGuards = serialize(guards);

  return (
    <div className="max-w-7xl mx-auto">
      <ShiftList 
        shifts={serializedShifts} 
        sites={serializedSites}
        shiftTypes={serializedShiftTypes}
        guards={serializedGuards}
      />
    </div>
  );
}
