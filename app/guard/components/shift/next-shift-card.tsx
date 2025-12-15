import { ShiftWithRelations } from '@/app/admin/(authenticated)/shifts/components/shift-list';
import { format } from 'date-fns';

interface NextShiftCardProps {
  shift: ShiftWithRelations;
}

export function NextShiftCard({ shift }: NextShiftCardProps) {
  return (
    <div className="border rounded-lg shadow-sm p-6 bg-blue-50 my-6 border-blue-200">
      <div className="flex items-center">
        <h2 className="text-2xl font-bold text-blue-800">Shift Mendatang</h2>
        
      </div>
      <span className="ml-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
          Upcoming
        </span>
      <p className="text-gray-700 font-semibold text-lg">{shift.site.name}</p>
      <p className="text-sm font-semibold text-gray-600 mt-1">
        {format(new Date(shift.startsAt), 'dd MMM yyyy, HH:mm')} - {format(new Date(shift.endsAt), 'HH:mm')}
      </p>
      <p className="text-sm text-gray-500 mt-2">
        Tipe Shift: {shift.shiftType.name}
      </p>
    </div>
  );
}