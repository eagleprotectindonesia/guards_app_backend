'use client';

import { useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface TimePickerProps {
  value: string | null;
  onChange: (value: string) => void;
  className?: string;
  use24h?: boolean;
}

export function TimePicker({ value, onChange, className, use24h = false }: TimePickerProps) {
  // Calculate display values from 24-hour value
  const { hour, minute, period } = useMemo(() => {
    if (!value) {
      return { hour: undefined, minute: undefined, period: undefined };
    }

    const [h24, m] = value.split(':');
    const hInt = parseInt(h24, 10);

    if (use24h) {
      return {
        hour: h24,
        minute: m,
        period: undefined
      };
    }

    let p: 'AM' | 'PM' = 'AM';
    let h12 = hInt;

    if (hInt >= 12) {
      p = 'PM';
      if (hInt > 12) h12 = hInt - 12;
    }
    if (hInt === 0) {
      h12 = 12;
    }

    return {
      hour: h12.toString().padStart(2, '0'),
      minute: m,
      period: p
    };
  }, [value, use24h]);

  const handleTimeChange = (type: 'hour' | 'minute' | 'period', val: string) => {
    // Defaults
    const currentHour = hour || (use24h ? '00' : '12');
    const currentMinute = minute || '00';
    const currentPeriod = period || 'AM';

    let newHour = currentHour;
    let newMinute = currentMinute;
    let newPeriod = currentPeriod;

    if (type === 'hour') newHour = val;
    else if (type === 'minute') newMinute = val;
    else if (type === 'period') newPeriod = val as 'AM' | 'PM';

    let h24Str: string;

    if (use24h) {
      h24Str = newHour;
    } else {
      // Convert to 24h
      let h24 = parseInt(newHour, 10);
      if (newPeriod === 'PM' && h24 !== 12) h24 += 12;
      if (newPeriod === 'AM' && h24 === 12) h24 = 0;
      h24Str = h24.toString().padStart(2, '0');
    }

    onChange(`${h24Str}:${newMinute}`);
  };

  const hourOptions = use24h
    ? Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'))
    : Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'));

  const minuteOptions = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'));

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Hour Select */}
      <Select value={hour} onValueChange={val => handleTimeChange('hour', val)}>
        <SelectTrigger className="w-[70px]">
          <SelectValue placeholder="HH" />
        </SelectTrigger>
        <SelectContent className="max-h-[200px] min-w-0 w-[70px]">
          {hourOptions.map(h => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="text-gray-500 font-medium">:</span>

      {/* Minute Select */}
      <Select value={minute} onValueChange={val => handleTimeChange('minute', val)}>
        <SelectTrigger className="w-[70px]">
          <SelectValue placeholder="MM" />
        </SelectTrigger>
        <SelectContent className="max-h-[200px] min-w-0 w-[70px]">
          {minuteOptions.map(m => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* AM/PM Select */}
      {!use24h && (
        <Select value={period} onValueChange={val => handleTimeChange('period', val)}>
          <SelectTrigger className="w-[70px]">
            <SelectValue placeholder="AM/PM">{period}</SelectValue>
          </SelectTrigger>
          <SelectContent className="min-w-0 w-[70px]">
            <SelectItem value="AM">AM</SelectItem>
            <SelectItem value="PM">PM</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
