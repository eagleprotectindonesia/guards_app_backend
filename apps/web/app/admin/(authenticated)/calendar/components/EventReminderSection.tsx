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

export function EventReminderSection({ reminderMinutesBefore, onChange }: EventReminderSectionProps) {
  const [isCustom, setIsCustom] = useState(reminderMinutesBefore !== null && !REMINDER_PRESETS.some(p => p.minutes === reminderMinutesBefore));

  const handleSelect = (value: string) => {
    if (value === '') {
      onChange(null);
      setIsCustom(false);
    } else if (value === '-1') {
      setIsCustom(true);
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
        value={isCustom ? '-1' : (reminderMinutesBefore === null ? '' : String(reminderMinutesBefore))}
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
        <div className="mt-2">
          <input
            type="number"
            min={0}
            value={reminderMinutesBefore ?? ''}
            onChange={e => onChange(Number(e.target.value) || 0)}
            className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-red-500 focus:outline-none"
            placeholder="Minutes before event"
          />
        </div>
      )}
    </div>
  );
}
