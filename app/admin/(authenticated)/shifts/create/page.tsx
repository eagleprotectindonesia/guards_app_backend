import { prisma } from '@/lib/prisma';
import { serialize } from '@/lib/utils';
import ShiftForm from '../components/shift-form';
import { getAllSites } from '@/lib/data-access/sites';
import { getActiveGuards } from '@/lib/data-access/guards';

export default async function CreateShiftPage() {
  const [sites, shiftTypes, guards] = await Promise.all([
    getAllSites(),
    prisma.shiftType.findMany({ orderBy: { name: 'asc' } }),
    getActiveGuards(),
  ]);

  return (
    <div className="max-w-6xl mx-auto py-8">
      <ShiftForm sites={serialize(sites)} shiftTypes={serialize(shiftTypes)} guards={serialize(guards)} />
    </div>
  );
}
