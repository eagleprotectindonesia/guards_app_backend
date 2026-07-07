import { useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { CalendarItem } from '../types';

interface DayViewProps {
  currentDate: Date;
  items: CalendarItem[];
  onEventClick: (item: CalendarItem) => void;
}

export function DayView({ currentDate, items, onEventClick }: DayViewProps) {
  const events = useMemo(() => {
    return items.map((item) => ({
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
        plugins={[timeGridPlugin, interactionPlugin]}
        initialView="timeGridDay"
        initialDate={currentDate.toISOString()}
        events={events}
        headerToolbar={false}
        height="auto"
        slotMinTime="06:00:00"
        slotMaxTime="22:00:00"
        allDaySlot={true}
        eventClick={(info) => {
          const item = info.event.extendedProps.item as CalendarItem;
          if (item) onEventClick(item);
        }}
      />
    </div>
  );
}
