import { ShiftWithRelations } from '@/app/admin/(authenticated)/shifts/components/shift-list';
import { format } from 'date-fns';

interface ShiftInfoCardProps {
  shift: ShiftWithRelations;
}

export function ShiftInfoCard({ shift }: ShiftInfoCardProps) {
  return (
    <div className="border rounded-lg shadow-sm p-6 bg-white mb-6">
      <h2 className="text-2xl font-semibold">{shift.shiftType.name}</h2>
      <p className="text-gray-700 font-semibold">{shift.site.name}</p>
      <p className="font-semibold text-gray-500 mt-1">
        {format(new Date(shift.startsAt), 'dd MMM yyyy, HH:mm')} - {format(new Date(shift.endsAt), 'HH:mm')}
      </p>
    </div>
  );
}
