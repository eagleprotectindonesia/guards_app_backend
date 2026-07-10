import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
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
  onDateContextMenu?: (date: string, event: MouseEvent) => void;
  onEventContextMenu?: (item: CalendarItem, clientX: number, clientY: number) => void;
}

function DayCellContent({ date, isOutside, count }: { date: Date; isOutside: boolean; count: number | undefined }) {
  return (
    <>
      <span className="fc-daygrid-day-number">{date.getDate()}</span>
      {count && !isOutside && (
        <div className="flex justify-center">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        </div>
      )}
    </>
  );
}

export function MonthGrid({
  currentDate,
  items,
  daySummary,
  onDateClick,
  onEventClick,
  onDateContextMenu,
  onEventContextMenu,
}: MonthGridProps) {
  const calendarRef = useRef<FullCalendar>(null);
  const [initialDateStr] = useState(() => format(currentDate, 'yyyy-MM-dd'));

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

  const handleDayCellDidMount = useCallback(
    (arg: { el: HTMLElement; date: Date }) => {
      if (!onDateContextMenu) return;
      const handler = (e: MouseEvent) => {
        e.preventDefault();
        onDateContextMenu(format(arg.date, 'yyyy-MM-dd'), e);
      };
      arg.el.addEventListener('contextmenu', handler);
      (arg.el as HTMLElement & { __ctxHandler?: (e: MouseEvent) => void }).__ctxHandler = handler;
    },
    [onDateContextMenu]
  );

  const handleDayCellWillUnmount = useCallback((arg: { el: HTMLElement }) => {
    const handler = (arg.el as HTMLElement & { __ctxHandler?: (e: MouseEvent) => void }).__ctxHandler;
    if (handler) {
      arg.el.removeEventListener('contextmenu', handler);
    }
  }, []);

  const handleEventDidMount = useCallback(
    (arg: { el: HTMLElement; event: { extendedProps: { item?: CalendarItem } } }) => {
      if (!onEventContextMenu) return;
      const item = arg.event.extendedProps.item;
      if (!item) return;
      const handler = (e: MouseEvent) => {
        e.preventDefault();
        onEventContextMenu(item, e.clientX, e.clientY);
      };
      arg.el.addEventListener('contextmenu', handler);
      (arg.el as HTMLElement & { __ctxHandler?: (e: MouseEvent) => void }).__ctxHandler = handler;
    },
    [onEventContextMenu]
  );

  const handleEventWillUnmount = useCallback((arg: { el: HTMLElement }) => {
    const handler = (arg.el as HTMLElement & { __ctxHandler?: (e: MouseEvent) => void }).__ctxHandler;
    if (handler) {
      arg.el.removeEventListener('contextmenu', handler);
    }
  }, []);

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
        dayCellDidMount={handleDayCellDidMount}
        dayCellWillUnmount={handleDayCellWillUnmount}
        eventDidMount={handleEventDidMount}
        eventWillUnmount={handleEventWillUnmount}
        dayCellClassNames="border-border hover:bg-muted cursor-pointer"
        dayHeaderClassNames="text-muted-foreground text-xs font-medium py-2 border-border"
        dayCellContent={arg => (
          <DayCellContent
            date={arg.date}
            isOutside={arg.isOutside}
            count={daySummary.get(format(arg.date, 'yyyy-MM-dd'))}
          />
        )}
      />
    </div>
  );
}
