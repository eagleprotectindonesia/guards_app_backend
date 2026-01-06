import { ShiftWithRelations } from '@/app/admin/(authenticated)/shifts/components/shift-list';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface NextShiftCardProps {
  shift: ShiftWithRelations;
}

export function NextShiftCard({ shift }: NextShiftCardProps) {
  return (
    <Card className="shadow-sm bg-blue-50 border-blue-200 my-6 h-full flex flex-col px-4">
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center">
          <CardTitle className="text-2xl text-blue-800">Shift Mendatang</CardTitle>
          <span className="ml-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
            Upcoming
          </span>
        </div>
      </CardHeader>
      <CardContent className="grow">
        <p className="text-gray-700 font-semibold text-lg">{shift.site.name}</p>
        <p className="font-semibold text-gray-500 mt-1">
          {format(new Date(shift.startsAt), 'dd MMM yyyy, HH:mm')} - {format(new Date(shift.endsAt), 'HH:mm')}
        </p>
        <p className="text-sm text-gray-500 mt-2">Tipe Shift: {shift.shiftType.name}</p>
      </CardContent>
    </Card>
  );
}
