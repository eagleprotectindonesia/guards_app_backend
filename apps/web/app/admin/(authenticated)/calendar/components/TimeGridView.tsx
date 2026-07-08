'use client';

import { memo, useMemo, useRef, useEffect, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { format, addDays, parseISO, isSameDay } from 'date-fns';
import type { CalendarItem } from '../types';

interface TimeGridViewProps {
  currentDate: Date;
  viewType: 'timeGridWeek' | 'timeGridDay';
  items: CalendarItem[];
  onEventClick: (item: CalendarItem) => void;
  onSlotSelect?: (date: string, time: string) => void;
}

export const TimeGridView = memo(function TimeGridView({
  currentDate,
  viewType,
  items,
  onEventClick,
  onSlotSelect,
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
        nowIndicator={true}
        slotDuration="00:30:00"
        slotLabelInterval="01:00"
        selectable={true}
        selectMirror={true}
        select={info => {
          onSlotSelect?.(
            format(info.start, 'yyyy-MM-dd'),
            format(info.start, 'HH:mm'),
          );
          info.view.calendar.unselect();
        }}
        eventClick={info => {
          const item = info.event.extendedProps.item as CalendarItem;
          if (item) onEventClick(item);
        }}
        dayHeaderContent={arg => {
          const d = arg.date;
          const today = isSameDay(d, new Date());
          return (
            <div className="flex flex-col items-center gap-0.5 py-1">
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider ${today ? 'text-primary' : 'text-muted-foreground'}`}
              >
                {format(d, 'EEE')}
              </span>
              <span
                className={`text-base font-semibold tabular-nums ${today ? 'text-primary' : 'text-foreground'}`}
              >
                {format(d, 'd')}
              </span>
            </div>
          );
        }}
        eventContent={arg => {
          const item = arg.event.extendedProps.item as CalendarItem;
          return (
            <div className="flex h-full flex-col gap-0.5 overflow-hidden px-1.5 py-1">
              <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider opacity-90 tabular-nums">
                <span>{format(parseISO(arg.event.startStr), 'HH:mm')}</span>
                {!arg.event.allDay && arg.event.endStr && (
                  <>
                    <span className="opacity-60">–</span>
                    <span>{format(parseISO(arg.event.endStr), 'HH:mm')}</span>
                  </>
                )}
              </div>
              <div className="truncate text-xs font-semibold leading-tight">
                {item.title}
              </div>
            </div>
          );
        }}
      />
    </div>
  );
});
