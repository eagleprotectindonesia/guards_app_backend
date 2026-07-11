'use client';

import { memo, useMemo, useRef, useEffect, useState, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { format, addDays, parseISO, isSameDay } from 'date-fns';
import type { CalendarItem } from '../types';

const SLOT_MIN_HOUR = 6;
const SLOT_MAX_HOUR = 22;
const SLOT_DURATION_MIN = 30;
const NUM_SLOTS = (SLOT_MAX_HOUR - SLOT_MIN_HOUR) * (60 / SLOT_DURATION_MIN);

interface TimeGridViewProps {
  currentDate: Date;
  viewType: 'timeGridWeek' | 'timeGridDay';
  weekStart: string;
  numDays: number;
  items: CalendarItem[];
  onEventClick: (item: CalendarItem) => void;
  onSlotSelect?: (date: string, time: string) => void;
  onSlotContextMenu?: (date: string, time: string, event: MouseEvent) => void;
  onEventContextMenu?: (item: CalendarItem, clientX: number, clientY: number) => void;
}

export const TimeGridView = memo(function TimeGridView({
  currentDate,
  viewType,
  weekStart,
  numDays,
  items,
  onEventClick,
  onSlotSelect,
  onSlotContextMenu,
  onEventContextMenu,
}: TimeGridViewProps) {
  const calendarRef = useRef<FullCalendar>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [initialDateStr] = useState(() => format(currentDate, 'yyyy-MM-dd'));

  useEffect(() => {
    if (!onSlotContextMenu) return;
    const container = containerRef.current;
    if (!container) return;

    const handler = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.fc-event')) return;

      const dayCol = container.querySelector<HTMLElement>('.fc-timegrid-col:not(.fc-timegrid-axis)');
      if (!dayCol) return;

      const dayColRect = dayCol.getBoundingClientRect();
      const xInCols = e.clientX - dayColRect.left;
      if (xInCols < 0) return;

      const firstLane = container.querySelector<HTMLElement>('.fc-timegrid-slot-lane');
      if (!firstLane) return;
      const firstLaneRect = firstLane.getBoundingClientRect();
      const slotHeight = firstLaneRect.height;
      if (slotHeight <= 0) return;

      const yInTimeArea = e.clientY - firstLaneRect.top;
      if (yInTimeArea < 0) return;

      const dayColWidth = dayColRect.width;
      if (dayColWidth <= 0) return;

      const colIndex = Math.floor(xInCols / dayColWidth);
      if (colIndex < 0 || colIndex >= numDays) return;

      const weekStartDate = parseISO(weekStart);
      const clickedDate = addDays(weekStartDate, colIndex);
      const dateStr = format(clickedDate, 'yyyy-MM-dd');

      const slotIndex = Math.floor(yInTimeArea / slotHeight);
      if (slotIndex < 0 || slotIndex >= NUM_SLOTS) return;

      const totalMinutes = slotIndex * SLOT_DURATION_MIN + SLOT_MIN_HOUR * 60;
      const hh = Math.floor(totalMinutes / 60);
      const mm = totalMinutes % 60;
      const timeStr = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;

      e.preventDefault();
      onSlotContextMenu(dateStr, timeStr, e);
    };

    container.addEventListener('contextmenu', handler);
    return () => container.removeEventListener('contextmenu', handler);
  }, [onSlotContextMenu, weekStart, numDays]);

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
      const end = first.allDay ? format(addDays(parseISO(last.date), 1), 'yyyy-MM-dd') : (last.endsAt ?? undefined);

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
    <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
      <FullCalendar
        ref={calendarRef}
        plugins={[timeGridPlugin, interactionPlugin]}
        initialView={viewType}
        initialDate={initialDateStr}
        events={events}
        headerToolbar={false}
        slotMinTime={`${String(SLOT_MIN_HOUR).padStart(2, '0')}:00:00`}
        slotMaxTime={`${String(SLOT_MAX_HOUR).padStart(2, '0')}:00:00`}
        allDaySlot={true}
        nowIndicator={true}
        slotDuration={`00:${String(SLOT_DURATION_MIN).padStart(2, '0')}:00`}
        slotLabelInterval="01:00"
        selectable={true}
        selectMirror={true}
        firstDay={0}
        select={info => {
          onSlotSelect?.(format(info.start, 'yyyy-MM-dd'), format(info.start, 'HH:mm'));
          info.view.calendar.unselect();
        }}
        eventDidMount={handleEventDidMount}
        eventWillUnmount={handleEventWillUnmount}
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
              <span className={`text-base font-semibold tabular-nums ${today ? 'text-primary' : 'text-foreground'}`}>
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
              <div className="truncate text-xs font-semibold leading-tight">{item.title}</div>
            </div>
          );
        }}
      />
    </div>
  );
});
