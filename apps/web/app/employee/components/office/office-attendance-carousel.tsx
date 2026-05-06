'use client';

import React from 'react';
import { format } from 'date-fns';
import { id, enUS } from 'date-fns/locale';
import { CalendarDays, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { Card, CardContent } from '@/components/ui/card';
import {
  parseOfficeAttendanceDayDate,
  resolveOfficeAttendanceIsToday,
  getOfficeHolidayDisplayContent,
} from './office-attendance-card-utils';
import type { OfficeAttendance, OfficeAttendanceState } from '@repo/types';
import { OfficeAttendanceHolidayPolicy } from '@/app/employee/(authenticated)/hooks/use-employee-queries';

export type OfficeAttendanceDaySummary = {
  date: string;
  dateKey: string | null;
  isWorkingDay: boolean;
  scheduledStartStr: string | null;
  scheduledEndStr: string | null;
  holidayPolicy?: OfficeAttendanceHolidayPolicy | null;
  attendances: OfficeAttendance[];
  attendanceState: OfficeAttendanceState;
};

interface OfficeAttendanceCarouselProps {
  weeklyDays: OfficeAttendanceDaySummary[];
  isLoading?: boolean;
}

export function OfficeAttendanceCarousel({ weeklyDays, isLoading }: OfficeAttendanceCarouselProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'id' ? id : enUS;

  if (isLoading || weeklyDays.length === 0) {
    return null;
  }

  const firstDayDateKey = weeklyDays[0]?.dateKey;

  const renderDayCard = (day: OfficeAttendanceDaySummary, index: number) => {
    const date = parseOfficeAttendanceDayDate(day.dateKey, day.date);
    const isToday = resolveOfficeAttendanceIsToday({
      dayDateKey: day.dateKey,
      firstDayDateKey,
      index,
    });
    const hasAttendance = day.attendances.length > 0;
    const holidayDisplay = getOfficeHolidayDisplayContent(t, day.holidayPolicy);
    const holidayType = day.holidayPolicy?.entry?.type;

    return (
      <Card className="rounded-[32px] overflow-hidden bg-[#0F0F0F] border-neutral-800 relative h-full">
        {/* Left Border Gradient Effect */}
        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-blue-600 opacity-50" />

        <CardContent className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-neutral-900 flex items-center justify-center border border-neutral-800">
                <CalendarDays className="w-4 h-4 text-blue-500" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm text-white font-medium">
                  {isToday ? t('common.today', 'Today') : format(date, 'EEEE', { locale: dateLocale })}
                </span>
                <span className="text-xs text-neutral-500">
                  {format(date, 'dd MMMM yyyy', { locale: dateLocale })}
                </span>
              </div>
            </div>
            {day.isWorkingDay && (
              <div className="bg-blue-500/15 border border-blue-400/30 text-blue-400 font-extrabold uppercase tracking-[2px] px-3 py-1.5 rounded-full text-[10px]">
                {isToday ? t('officeAttendance.workingDay') : t('shift.upcomingStatus')}
              </div>
            )}
          </div>

          {/* Details */}
          {day.isWorkingDay ? (
            <div className="space-y-4">
              {holidayDisplay ? (
                <div
                  className={`rounded-2xl border p-4 ${
                    holidayType === 'emergency'
                      ? 'bg-amber-500/10 border-amber-500/20'
                      : holidayType === 'special_working_day'
                        ? 'bg-blue-500/10 border-blue-500/20'
                        : 'bg-emerald-500/10 border-emerald-500/20'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-neutral-400 uppercase tracking-[1.2px] font-bold">
                        {holidayDisplay.headline}
                      </span>
                      <span className="text-[10px] text-neutral-400">
                        {holidayDisplay.typeLabel}
                      </span>
                    </div>
                    <p className="text-sm text-white font-semibold">
                      {holidayDisplay.title}
                    </p>
                    <p
                      className={`text-sm ${
                        holidayType === 'emergency'
                          ? 'text-amber-200'
                          : holidayType === 'special_working_day'
                            ? 'text-blue-200'
                            : 'text-emerald-200'
                      }`}
                    >
                      {holidayDisplay.impact}
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-[1.5px] mb-1.5 font-semibold block">
                    {t('officeAttendance.windowLabel')}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-md text-white font-medium font-mono">
                      {day.scheduledStartStr || '--:--'} — {day.scheduledEndStr || '--:--'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="h-[1px] w-full bg-white/10" />

              {hasAttendance ? (
                <div className="space-y-3">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-[1.5px] font-bold block">
                    {t('officeAttendance.history')}
                  </span>
                  {day.attendances.map(attendance => (
                    <div
                      key={attendance.id}
                      className="flex justify-between items-center bg-white/5 border border-white/5 rounded-xl px-4 py-3"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            attendance.status === 'present' ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                        />
                        <span className="text-sm text-white">
                          {attendance.status === 'present' ? t('officeAttendance.in') : t('officeAttendance.out')}
                        </span>
                      </div>
                      <span className="text-sm text-neutral-400 font-medium font-mono">
                        {format(new Date(attendance.recordedAt), 'HH:mm')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 relative flex items-center justify-center">
                      <div className="absolute w-2 h-2 rounded-full bg-emerald-400 opacity-75 animate-ping" />
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    </div>
                    <span className="text-sm text-neutral-400 font-medium">
                      {t('officeAttendance.noAttendance')}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-4 text-center">
              <p className="text-neutral-400">{t('officeAttendance.nonWorkingDay')}</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="w-full relative px-1">
      <Carousel
        opts={{
          align: "start",
          loop: false,
        }}
        className="w-full"
      >
        <CarouselContent className="-ml-4">
          {weeklyDays.map((day, index) => (
            <CarouselItem key={day.date} className="pl-4 basis-full">
              {renderDayCard(day, index)}
            </CarouselItem>
          ))}
        </CarouselContent>
        {weeklyDays.length > 1 && (
          <>
            <CarouselPrevious className="hidden sm:flex -left-4 bg-neutral-900 border-neutral-800 text-blue-500" />
            <CarouselNext className="hidden sm:flex -right-4 bg-neutral-900 border-neutral-800 text-blue-500" />
          </>
        )}
      </Carousel>
    </div>
  );
}
