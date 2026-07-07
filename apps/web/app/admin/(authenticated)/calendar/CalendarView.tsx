'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useSocket } from '@/components/socket-provider';
import { MonthGrid } from './components/MonthGrid';
import { TimeGridView } from './components/TimeGridView';
import { EventDetailPanel } from './components/EventDetailPanel';
import { EventForm } from './components/EventForm';
import { FilterBar } from './components/FilterBar';
import { ViewToggle } from './components/ViewToggle';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay, addMonths, subMonths, format, parseISO } from 'date-fns';
import { useSession } from '../context/session-context';
import type { CalendarItem } from './types';

type ViewMode = 'month' | 'week' | 'day';

interface CalendarFilters {
  employeeId?: string;
  kinds?: string[];
  search?: string;
  priority?: string[];
  clientName?: string;
}

interface DaySummary {
  date: string;
  count: number;
}

export function CalendarView() {
  const [view, setView] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarItem | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editEventId, setEditEventId] = useState<string | null>(null);
  const [filters, setFilters] = useState<CalendarFilters>({});
  const queryClient = useQueryClient();
  const session = useSession();
  const { socket } = useSocket();

  const dateRange = useMemo(() => {
    if (view === 'month') {
      return {
        from: format(startOfWeek(startOfMonth(currentDate)), 'yyyy-MM-dd'),
        to: format(endOfWeek(endOfMonth(currentDate)), 'yyyy-MM-dd'),
      };
    }
    if (view === 'week') {
      return {
        from: format(startOfWeek(currentDate), 'yyyy-MM-dd'),
        to: format(endOfWeek(currentDate), 'yyyy-MM-dd'),
      };
    }
    return {
      from: format(startOfDay(currentDate), 'yyyy-MM-dd'),
      to: format(endOfDay(currentDate), 'yyyy-MM-dd'),
    };
  }, [view, currentDate]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ from: dateRange.from, to: dateRange.to });
    if (filters.employeeId) params.set('employeeId', filters.employeeId);
    if (filters.kinds && filters.kinds.length > 0) params.set('kind', filters.kinds.join(','));
    if (filters.search) params.set('search', filters.search);
    if (filters.priority && filters.priority.length > 0) params.set('priority', filters.priority.join(','));
    if (filters.clientName) params.set('clientName', filters.clientName);
    return params.toString();
  }, [dateRange, filters]);

  const { data: summaryData } = useQuery({
    queryKey: ['admin', 'calendar', 'day-summary', dateRange.from, dateRange.to, filters.employeeId],
    queryFn: async () => {
      const params = new URLSearchParams({ from: dateRange.from, to: dateRange.to });
      if (filters.employeeId) params.set('employeeId', filters.employeeId);
      const res = await fetch(`/api/admin/calendar/day-summary?${params}`);
      if (!res.ok) throw new Error('Failed to fetch day summary');
      return res.json() as Promise<{ days: DaySummary[] }>;
    },
    enabled: view === 'month',
    staleTime: 30000,
    placeholderData: keepPreviousData,
  });

  const {
    data: itemsData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['admin', 'calendar', 'items', queryString],
    queryFn: async () => {
      const res = await fetch(`/api/admin/calendar?${queryString}`);
      if (!res.ok) throw new Error('Failed to fetch calendar items');
      return res.json() as Promise<{ items: CalendarItem[] }>;
    },
    staleTime: 30000,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!socket) return;
    const handler = (_payload: { type: string; eventId: string }) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'calendar'] });
    };
    socket.on('calendar_changed', handler);
    return () => {
      socket.off('calendar_changed', handler);
    };
  }, [socket, queryClient]);

  // Prefetch adjacent months
  useEffect(() => {
    const prefetchRange = (from: string, to: string) => {
      queryClient.prefetchQuery({
        queryKey: ['admin', 'calendar', 'day-summary', from, to, filters.employeeId],
        queryFn: async () => {
          const params = new URLSearchParams({ from, to });
          if (filters.employeeId) params.set('employeeId', filters.employeeId);
          const res = await fetch(`/api/admin/calendar/day-summary?${params}`);
          if (!res.ok) throw new Error('Failed to fetch day summary');
          return res.json() as Promise<{ days: { date: string; count: number }[] }>;
        },
        staleTime: 30000,
      });
    };

    if (view === 'month') {
      const nextFrom = format(addMonths(parseISO(dateRange.from), 1), 'yyyy-MM-dd');
      const nextTo = format(addMonths(parseISO(dateRange.to), 1), 'yyyy-MM-dd');
      const prevFrom = format(subMonths(parseISO(dateRange.from), 1), 'yyyy-MM-dd');
      const prevTo = format(subMonths(parseISO(dateRange.to), 1), 'yyyy-MM-dd');
      prefetchRange(prevFrom, prevTo);
      prefetchRange(nextFrom, nextTo);
    }
  }, [dateRange.from, dateRange.to, filters.employeeId, queryClient, view]);

  const items = itemsData?.items ?? [];
  const daySummaryMap = useMemo(() => {
    const map = new Map<string, number>();
    if (summaryData?.days) {
      for (const d of summaryData.days) {
        map.set(d.date, d.count);
      }
    }
    return map;
  }, [summaryData]);

  const handleEventClick = useCallback((item: CalendarItem) => {
    setSelectedEvent(item);
  }, []);

  const handleDateClick = useCallback((date: string) => {
    setSelectedDate(date);
    setCurrentDate(startOfDay(parseISO(date)));
    setView('day');
  }, []);

  const handleEditEvent = useCallback((eventId: string) => {
    setEditEventId(eventId);
    setSelectedEvent(null);
  }, []);

  const handleFormSuccess = useCallback(() => {
    setShowCreateModal(false);
    setEditEventId(null);
    queryClient.invalidateQueries({ queryKey: ['admin', 'calendar'] });
  }, [queryClient]);

  return (
    <div className="flex h-full gap-4">
      <div className="flex-1 space-y-4">
        <div className="flex items-center justify-between">
          <FilterBar filters={filters} onFiltersChange={setFilters} />
          <div className="flex items-center gap-2">
            {session.hasPermission('user-calendar:create') && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                + New Event
              </button>
            )}
            <ViewToggle view={view} onViewChange={setView} currentDate={currentDate} onDateChange={setCurrentDate} />
          </div>
        </div>

        {view === 'month' && (
          <MonthGrid
            currentDate={currentDate}
            items={items}
            daySummary={daySummaryMap}
            onDateClick={handleDateClick}
            onEventClick={handleEventClick}
          />
        )}
        {(view === 'week' || view === 'day') && (
          <TimeGridView
            currentDate={currentDate}
            viewType={view === 'week' ? 'timeGridWeek' : 'timeGridDay'}
            items={items}
            onEventClick={handleEventClick}
          />
        )}

        {isError && (
          <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
            <span>Failed to load calendar events. {(error as Error)?.message ?? 'Please try again.'}</span>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['admin', 'calendar', 'items'] })}
              className="ml-auto rounded-lg bg-red-600/20 px-3 py-1 font-medium text-red-400 hover:bg-red-600/30"
            >
              Retry
            </button>
          </div>
        )}

        {isLoading && <div className="flex items-center justify-center py-8 text-muted-foreground">Loading...</div>}
      </div>

      {selectedEvent && (
        <EventDetailPanel
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onEdit={handleEditEvent}
          onDelete={handleFormSuccess}
          hasEditPermission={
            session.hasPermission('user-calendar:edit') &&
            selectedEvent.ownerType === 'admin' &&
            selectedEvent.ownerId === session.userId
          }
          hasDeletePermission={
            session.hasPermission('user-calendar:delete') &&
            selectedEvent.ownerType === 'admin' &&
            selectedEvent.ownerId === session.userId
          }
        />
      )}

      {showCreateModal && <EventForm onClose={() => setShowCreateModal(false)} onSuccess={handleFormSuccess} />}

      {editEventId && (
        <EventForm eventId={editEventId} onClose={() => setEditEventId(null)} onSuccess={handleFormSuccess} />
      )}
    </div>
  );
}
