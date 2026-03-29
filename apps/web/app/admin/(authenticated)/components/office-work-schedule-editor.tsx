'use client';

import { useState } from 'react';
import { TimePicker } from '@/components/ui/time-picker';

export type OfficeWorkScheduleDayFormValue = {
  weekday: number;
  isWorkingDay: boolean;
  startTime: string | null;
  endTime: string | null;
};

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type Props = {
  inputName?: string;
  initialDays: OfficeWorkScheduleDayFormValue[];
  disabled?: boolean;
};

export default function OfficeWorkScheduleEditor({ inputName = 'days', initialDays, disabled = false }: Props) {
  const [days, setDays] = useState<OfficeWorkScheduleDayFormValue[]>(() =>
    [...initialDays].sort((a, b) => a.weekday - b.weekday)
  );

  const updateDay = (weekday: number, patch: Partial<OfficeWorkScheduleDayFormValue>) => {
    setDays(current =>
      current.map(day => {
        if (day.weekday !== weekday) return day;

        const next = { ...day, ...patch };
        if (patch.isWorkingDay === false) {
          next.startTime = null;
          next.endTime = null;
        }

        return next;
      })
    );
  };

  return (
    <div className="space-y-4">
      <input type="hidden" name={inputName} value={JSON.stringify(days)} />

      {days.map(day => (
        <div
          key={day.weekday}
          className="grid grid-cols-1 md:grid-cols-[180px_120px_1fr_1fr] gap-3 items-center rounded-lg border border-border p-4 bg-muted/20"
        >
          <div>
            <div className="font-medium text-foreground">{WEEKDAY_LABELS[day.weekday]}</div>
            <div className="text-xs text-muted-foreground">Weekday {day.weekday}</div>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={day.isWorkingDay}
              disabled={disabled}
              onChange={event => updateDay(day.weekday, { isWorkingDay: event.target.checked })}
              className="h-4 w-4 rounded border-border"
            />
            Working day
          </label>

          <TimePicker
            value={day.startTime}
            onChange={value => updateDay(day.weekday, { startTime: value || null })}
            disabled={disabled || !day.isWorkingDay}
            className="w-full"
            use24h={true}
          />

          <TimePicker
            value={day.endTime}
            onChange={value => updateDay(day.weekday, { endTime: value || null })}
            disabled={disabled || !day.isWorkingDay}
            className="w-full"
            use24h={true}
          />
        </div>
      ))}
    </div>
  );
}
