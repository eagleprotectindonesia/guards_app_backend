'use client';

import { memo, useMemo, useRef, useEffect, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { format, addDays, parseISO } from 'date-fns';
import type { CalendarItem } from '../types';

interface TimeGridViewProps {
  currentDate: Date;
  viewType: 'timeGridWeek' | 'timeGridDay';
  items: CalendarItem[];
  onEventClick: (item: CalendarItem) => void;
}

export const TimeGridView = memo(function TimeGridView({
  currentDate,
  viewType,
  items,
  onEventClick,
}: TimeGridViewProps) {
  const calendarRef = useRef<FullCalendar>(null);
  const [initialDateStr] = useState(() => format(currentDate, 'yyyy-MM-dd'));

  useEffect(() => {
    if (calendarRef.current) {
      calendarRef.current.getApi().gotoDate(currentDate);
    }
  }, [currentDate]);

  const events = useMemo(() => {
    const groups = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const key = item.originalId;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }

    return Array.from(groups.values()).map(group => {
      group.sort((a, b) => a.date.localeCompare(b.date));
      const first = group[0];
      const last = group[group.length - 1];

      const start = first.allDay ? first.date : (first.startsAt ?? first.date);
      const end = first.allDay
        ? format(addDays(parseISO(last.date), 1), 'yyyy-MM-dd')
        : (last.endsAt ?? undefined);

      return {
        id: first.originalId,
        title: first.title,
        start,
        end,
        allDay: first.allDay,
        backgroundColor: first.colorHint ?? '#8E8E93',
        borderColor: 'transparent',
        textColor: '#fff',
        extendedProps: { item: first },
        classNames: ['text-xs', 'truncate', 'px-1', 'rounded'],
      };
    });
  }, [items]);

  return (
    <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
      <FullCalendar
        ref={calendarRef}
        plugins={[timeGridPlugin, interactionPlugin]}
        initialView={viewType}
        initialDate={initialDateStr}
        events={events}
        headerToolbar={false}
        height="100%"
        slotMinTime="06:00:00"
        slotMaxTime="22:00:00"
        allDaySlot={true}
        eventClick={info => {
          const item = info.event.extendedProps.item as CalendarItem;
          if (item) onEventClick(item);
        }}
      />
    </div>
  );
});
