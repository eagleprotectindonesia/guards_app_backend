import type { ShiftWithRelationsDto } from '@/types/shifts';
import { format } from 'date-fns';
import { enUS, id } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, MapPin } from 'lucide-react';

interface ShiftInfoCardProps {
  shift: ShiftWithRelationsDto;
}

export function ShiftInfoCard({ shift }: ShiftInfoCardProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'id' ? id : enUS;

  return (
    <Card className="shadow-2xl bg-[#0a0a0a] border border-neutral-800 my-6 h-full flex flex-col px-4 relative overflow-hidden rounded-3xl">
      {/* Red Glow Effect - Mimicking Mobile */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/5 rounded-full blur-3xl transform translate-x-8 -translate-y-8 pointer-events-none" />
      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-red-600/50" />

      <CardContent className="p-6 relative z-10 flex flex-col h-full">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center">
              <CalendarCheck className="w-5 h-5 text-[#D92323]" />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-none">{t('shift.currentTitle')}</p>
            </div>
          </div>
          <div className="bg-[#D92323]/15 border border-[#D92323]/30 px-3 py-1.5 rounded-full">
            <span className="text-[#D92323] text-xs font-extrabold uppercase tracking-widest leading-none">
              {t('shift.activeStatus')}
            </span>
          </div>
        </div>

        {/* Details - 2 Cols */}
        <div className="flex gap-4 mb-auto">
          <div className="flex-1">
            <p className="text-neutral-500 text-xs uppercase tracking-widest font-semibold mb-1.5">
              {t('shift.station')}
            </p>
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#D92323]" />
              <p className="text-neutral-200 text-sm font-medium truncate">
                {shift.site?.name || t('shift.defaultLocation')}
              </p>
            </div>
          </div>
          <div className="flex-1 text-right">
            <p className="text-neutral-500 text-xs uppercase tracking-widest font-semibold mb-1.5">
              {t('shift.timeframe')}
            </p>
            <p className="text-white text-sm font-medium tracking-wide">
              {format(new Date(shift.startsAt), 'HH:mm', { locale: dateLocale })} —{' '}
              {format(new Date(shift.endsAt), 'HH:mm', { locale: dateLocale })}
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px w-full bg-white/10 my-4" />

        {/* Footer */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="relative w-8 h-8 flex items-center justify-center">
              <div className="absolute w-8 h-8 rounded-full bg-green-500/20" />
              <div className="w-2 h-2 rounded-full bg-green-500" />
            </div>
            <p className="text-neutral-400 text-sm font-medium">{shift.shiftType?.name || 'Main Rotation'}</p>
          </div>
          <div className="bg-white/5 border border-white/5 px-3 py-1 rounded-md">
            <p className="text-neutral-300 text-xs font-bold uppercase">
              {format(new Date(shift.startsAt), 'dd MMM', { locale: dateLocale })}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
