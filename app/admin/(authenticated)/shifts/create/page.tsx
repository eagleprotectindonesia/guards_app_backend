import { prisma } from '@/lib/prisma';
import { serialize } from '@/lib/utils';
import ShiftForm from '../components/shift-form';

export default async function CreateShiftPage() {
  const [sites, shiftTypes, guards] = await Promise.all([
    prisma.site.findMany({ orderBy: { name: 'asc' } }),
    prisma.shiftType.findMany({ orderBy: { name: 'asc' } }),
    prisma.guard.findMany({
      where: { status: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <div className="max-w-4xl mx-auto py-8">
      <ShiftForm sites={serialize(sites)} shiftTypes={serialize(shiftTypes)} guards={serialize(guards)} />
    </div>
  );
}
