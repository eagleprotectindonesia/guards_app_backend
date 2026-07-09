import { useState } from 'react';
import { REMINDER_PRESETS } from '@repo/shared';

const REMINDER_LABELS: Record<string, string> = {
  reminderAtEvent: 'At event time',
  reminder10Min: '10 minutes before',
  reminder30Min: '30 minutes before',
  reminder1Hour: '1 hour before',
  reminder1Day: '1 day before',
  reminder3Days: '3 days before',
  reminder1Week: '1 week before',
};

interface EventReminderSectionProps {
  reminderMinutesBefore: number | null;
  onChange: (minutes: number | null) => void;
}

const CUSTOM_UNITS = ['minutes', 'hours', 'days'] as const;
type CustomUnit = (typeof CUSTOM_UNITS)[number];

function detectUnit(minutes: number): CustomUnit {
  if (minutes >= 1440 && minutes % 1440 === 0) return 'days';
  if (minutes >= 60 && minutes % 60 === 0) return 'hours';
  return 'minutes';
}

const UNIT_FACTOR: Record<CustomUnit, number> = { minutes: 1, hours: 60, days: 1440 };

export function EventReminderSection({ reminderMinutesBefore, onChange }: EventReminderSectionProps) {
  const [isCustom, setIsCustom] = useState(reminderMinutesBefore !== null && !REMINDER_PRESETS.some(p => p.minutes === reminderMinutesBefore));
  const [customUnit, setCustomUnit] = useState<CustomUnit>(reminderMinutesBefore !== null ? detectUnit(reminderMinutesBefore) : 'minutes');

  const unitFactor = UNIT_FACTOR[customUnit];
  const displayValue = reminderMinutesBefore !== null ? Math.round(reminderMinutesBefore / unitFactor) : 0;

  const handleSelect = (value: string) => {
    if (value === '') {
      onChange(null);
      setIsCustom(false);
    } else if (value === '-1') {
      setIsCustom(true);
      setCustomUnit(reminderMinutesBefore !== null ? detectUnit(reminderMinutesBefore) : 'minutes');
      onChange(reminderMinutesBefore ?? 0);
    } else {
      onChange(Number(value));
      setIsCustom(false);
    }
  };

  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">Reminder</label>
      <select
        value={isCustom ? '-1' : (reminderMinutesBefore === null || !REMINDER_PRESETS.some(p => p.minutes === reminderMinutesBefore) ? '' : String(reminderMinutesBefore))}
        onChange={e => handleSelect(e.target.value)}
        className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-red-500 focus:outline-none"
      >
        <option value="">No reminder</option>
        {REMINDER_PRESETS.map(p => (
          <option key={p.minutes} value={p.minutes}>
            {REMINDER_LABELS[p.labelKey] ?? p.labelKey}
          </option>
        ))}
        <option value="-1">Custom...</option>
      </select>
      {isCustom && (
        <div className="mt-2 flex gap-2">
          <input
            type="number"
            min={0}
            value={displayValue}
            onChange={e => {
              const val = Number(e.target.value) || 0;
              onChange(val * unitFactor);
            }}
            className="min-w-0 flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-red-500 focus:outline-none"
            placeholder="Amount"
          />
          <select
            value={customUnit}
            onChange={e => setCustomUnit(e.target.value as CustomUnit)}
            className="w-28 rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-red-500 focus:outline-none"
          >
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
            <option value="days">Days</option>
          </select>
        </div>
      )}
    </div>
  );
}
