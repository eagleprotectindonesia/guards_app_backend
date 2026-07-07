import { useMemo, useRef, useEffect, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { format } from 'date-fns';
import type { CalendarItem } from '../types';

interface MonthGridProps {
  currentDate: Date;
  items: CalendarItem[];
  daySummary: Map<string, number>;
  onDateClick: (date: string) => void;
  onEventClick: (item: CalendarItem) => void;
}

export function MonthGrid({ currentDate, items, daySummary, onDateClick, onEventClick }: MonthGridProps) {
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
      start: item.date,
      allDay: true,
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
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        initialDate={initialDateStr}
        events={events}
        headerToolbar={false}
        dayMaxEvents={3}
        height="auto"
        dateClick={info => onDateClick(info.dateStr)}
        eventClick={info => {
          const item = info.event.extendedProps.item as CalendarItem;
          if (item) onEventClick(item);
        }}
        dayCellClassNames="border-border hover:bg-muted cursor-pointer"
        dayHeaderClassNames="text-muted-foreground text-xs font-medium py-2 border-border"
        dayCellDidMount={info => {
          const dateStr = format(info.date, 'yyyy-MM-dd');
          const count = daySummary.get(dateStr);
          if (count && !info.isOutside) {
            const existing = info.el.querySelector('.calendar-dot-marker');
            if (existing) existing.remove();
            const dot = document.createElement('div');
            dot.className = 'calendar-dot-marker flex justify-center mt-0.5';
            dot.innerHTML = `<span class="h-1.5 w-1.5 rounded-full bg-red-500"></span>`;
            info.el.querySelector('.fc-daygrid-day-events')?.prepend(dot);
          }
        }}
      />
    </div>
  );
}
