'use client';

import { memo, useMemo, Fragment } from 'react';
import { format, parseISO } from 'date-fns';
import { Clock, User, MapPin } from 'lucide-react';
import { KIND_COLORS, KIND_LABELS } from '@repo/shared';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { CalendarItem } from '../types';

interface ListViewProps {
  items: CalendarItem[];
  onEventClick: (item: CalendarItem) => void;
  onEventContextMenu?: (item: CalendarItem, clientX: number, clientY: number) => void;
}

interface RowEntry {
  item: CalendarItem;
  startDate: string;
  endDate: string;
  isMultiDay: boolean;
}

interface DayGroup {
  dateLabel: string;
  dateKey: string;
  isToday: boolean;
  rows: RowEntry[];
}

const shortDate = (d: string) => format(parseISO(d), 'MMM d');

function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  return iso.slice(11, 16);
}

export const ListView = memo(function ListView({ items, onEventClick, onEventContextMenu }: ListViewProps) {
  const dayGroups = useMemo(() => {
    const eventMap = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const key = item.originalId;
      if (!eventMap.has(key)) eventMap.set(key, []);
      eventMap.get(key)!.push(item);
    }

    const rows: RowEntry[] = [];
    for (const [, occurrences] of eventMap) {
      occurrences.sort((a, b) => a.date.localeCompare(b.date));
      const first = occurrences[0];
      const last = occurrences[occurrences.length - 1];
      rows.push({
        item: first,
        startDate: first.date,
        endDate: last.date,
        isMultiDay: first.date !== last.date,
      });
    }

    rows.sort((a, b) => {
      const dateCmp = a.startDate.localeCompare(b.startDate);
      if (dateCmp !== 0) return dateCmp;
      if (a.item.allDay !== b.item.allDay) return a.item.allDay ? -1 : 1;
      const timeA = a.item.startsAt ?? '';
      const timeB = b.item.startsAt ?? '';
      const timeCmp = timeA.localeCompare(timeB);
      if (timeCmp !== 0) return timeCmp;
      return a.item.title.localeCompare(b.item.title);
    });

    const groups = new Map<string, RowEntry[]>();
    for (const row of rows) {
      const dayKey = row.startDate;
      if (!groups.has(dayKey)) groups.set(dayKey, []);
      groups.get(dayKey)!.push(row);
    }

    const todayKey = format(new Date(), 'yyyy-MM-dd');
    const result: DayGroup[] = [];
    const sortedKeys = Array.from(groups.keys()).sort();
    for (const key of sortedKeys) {
      result.push({
        dateLabel: format(parseISO(key), 'EEEE, MMMM d, yyyy'),
        dateKey: key,
        isToday: key === todayKey,
        rows: groups.get(key)!,
      });
    }

    return result;
  }, [items]);

  if (dayGroups.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border bg-card py-16">
        <p className="text-sm text-muted-foreground">No events in this range.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">Time</TableHead>
            <TableHead>Title</TableHead>
            <TableHead className="w-28">Kind</TableHead>
            <TableHead className="w-44">Owner</TableHead>
            <TableHead className="w-20">Priority</TableHead>
            <TableHead className="w-40">Location</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dayGroups.map(group => (
            <Fragment key={group.dateKey}>
              <TableRow className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                <TableCell
                  colSpan={6}
                  className={`py-2 text-xs font-semibold uppercase tracking-wider ${
                    group.isToday ? 'text-red-400' : 'text-muted-foreground'
                  }`}
                >
                  {group.dateLabel}
                  {group.isToday && ' — Today'}
                </TableCell>
              </TableRow>
              {group.rows.map(row => {
                const item = row.item;
                const color = item.colorHint ?? KIND_COLORS[item.kind] ?? '#8E8E93';
                return (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer"
                    onClick={() => onEventClick(item)}
                    onContextMenu={e => {
                      e.preventDefault();
                      onEventContextMenu?.(item, e.clientX, e.clientY);
                    }}
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onEventClick(item);
                      }
                    }}
                  >
                    <TableCell className="text-sm text-muted-foreground">
                      {item.allDay ? (
                        <span className="flex items-center gap-1">
                          <span className="text-xs">All day</span>
                          {row.isMultiDay && (
                            <span className="text-xs text-muted-foreground/60">· until {shortDate(row.endDate)}</span>
                          )}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 shrink-0" />
                          {formatTime(item.startsAt)}
                          {item.endsAt && <> – {formatTime(item.endsAt)}</>}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm font-medium text-foreground">
                      {item.title}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-sm text-muted-foreground">
                          {KIND_LABELS[item.kind] ?? item.kind}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-foreground">
                        <User className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">{item.ownerName}</span>
                        <span
                          className={`ml-1 rounded px-1 py-0.5 text-[10px] ${
                            item.ownerType === 'admin'
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-green-500/20 text-green-400'
                          }`}
                        >
                          {item.ownerType === 'employee' ? 'Employee' : 'Admin'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.priority && item.priority !== 'normal' ? (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            item.priority === 'urgent'
                              ? 'bg-red-500/20 text-red-400'
                              : item.priority === 'high'
                                ? 'bg-orange-500/20 text-orange-400'
                                : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {item.priority}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-32 truncate text-sm text-muted-foreground">
                      {item.location ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{item.location}</span>
                        </span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
});
