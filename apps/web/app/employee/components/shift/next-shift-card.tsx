import type { ShiftWithRelationsDto } from '@/types/shifts';
import { format } from 'date-fns';
import { enUS, id } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { CalendarClock, MapPin } from 'lucide-react';

interface NextShiftCardProps {
  shift: ShiftWithRelationsDto;
}

export function NextShiftCard({ shift }: NextShiftCardProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'id' ? id : enUS;

  return (
    <Card className="shadow-none bg-white/5 border border-white/5 my-6 h-full flex flex-col px-4 backdrop-blur-sm rounded-3xl">
      <CardContent className="p-6 relative z-10 flex flex-col h-full">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center">
              <CalendarClock className="w-5 h-5 text-neutral-500" />
            </div>
            <div>
              <p className="text-neutral-300 font-semibold text-sm leading-none">{t('shift.upcomingTitle')}</p>
            </div>
          </div>
        </div>

        {/* Details - 2 Cols */}
        <div className="flex gap-4 mb-auto">
          <div className="flex-1">
            <p className="text-neutral-600 text-xs uppercase tracking-widest font-semibold mb-1">
              {t('shift.station')}
            </p>
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-neutral-600" />
              <p className="text-neutral-400 text-sm font-medium truncate">
                {shift.site?.name || t('shift.defaultLocation')}
              </p>
            </div>
          </div>
          <div className="flex-1 text-right">
            <p className="text-neutral-600 text-xs uppercase tracking-widest font-semibold mb-1">
              {t('shift.timeframe')}
            </p>
            <p className="text-neutral-300 text-sm font-medium tracking-wide">
              {format(new Date(shift.startsAt), 'HH:mm', { locale: dateLocale })} —{' '}
              {format(new Date(shift.endsAt), 'HH:mm', { locale: dateLocale })}
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px w-full bg-white/5 my-4" />

        {/* Footer */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="relative w-8 h-8 flex items-center justify-center">
              <div className="absolute w-6 h-6 rounded-full bg-neutral-600/20" />
            </div>
            <p className="text-neutral-400 text-sm font-medium">{shift.shiftType?.name || 'Main Rotation'}</p>
          </div>

          <p className="text-neutral-500 text-xs font-bold uppercase">
            {format(new Date(shift.startsAt), 'dd MMM yyyy', { locale: dateLocale })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
