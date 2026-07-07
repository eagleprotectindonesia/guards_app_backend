'use client';

import { memo, useMemo, useRef, useEffect, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
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
  const [initialDateStr] = useState(() => currentDate.toISOString());

  useEffect(() => {
    if (calendarRef.current) {
      calendarRef.current.getApi().gotoDate(currentDate);
    }
  }, [currentDate]);

  const events = useMemo(() => {
    return items.map(item => ({
      id: item.id,
      title: item.title,
      start: item.startsAt ?? item.date,
      end: item.endsAt ?? undefined,
      allDay: item.allDay,
      backgroundColor: item.colorHint ?? '#8E8E93',
      borderColor: 'transparent',
      textColor: '#fff',
      extendedProps: { item },
      classNames: ['text-xs', 'truncate', 'px-1', 'rounded'],
    }));
  }, [items]);

  return (
    <div className="rounded-lg border border-border bg-card">
      <FullCalendar
        ref={calendarRef}
        plugins={[timeGridPlugin, interactionPlugin]}
        initialView={viewType}
        initialDate={initialDateStr}
        events={events}
        headerToolbar={false}
        height="auto"
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
