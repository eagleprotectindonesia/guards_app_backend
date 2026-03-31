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
const DISPLAY_WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const sortDaysForDisplay = (items: OfficeWorkScheduleDayFormValue[]) =>
  [...items].sort((a, b) => DISPLAY_WEEKDAY_ORDER.indexOf(a.weekday) - DISPLAY_WEEKDAY_ORDER.indexOf(b.weekday));

type Props = {
  inputName?: string;
  initialDays: OfficeWorkScheduleDayFormValue[];
  disabled?: boolean;
};

export default function OfficeWorkScheduleEditor({ inputName = 'days', initialDays, disabled = false }: Props) {
  const [days, setDays] = useState<OfficeWorkScheduleDayFormValue[]>(() => sortDaysForDisplay(initialDays));

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

  const copyMondayToAllDays = () => {
    setDays(current => {
      const monday = current.find(day => day.weekday === 1);

      if (!monday) {
        return current;
      }

      return current.map(day => {
        if (day.weekday === 1) {
          return day;
        }

        return {
          ...day,
          isWorkingDay: monday.isWorkingDay,
          startTime: monday.isWorkingDay ? monday.startTime : null,
          endTime: monday.isWorkingDay ? monday.endTime : null,
        };
      });
    });
  };

  return (
    <div className="space-y-4">
      <input type="hidden" name={inputName} value={JSON.stringify(days)} />

      <div className="flex justify-end">
        <button
          type="button"
          onClick={copyMondayToAllDays}
          disabled={disabled}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Copy Monday to all days
        </button>
      </div>

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
