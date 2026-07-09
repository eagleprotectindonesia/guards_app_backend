'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSocket } from '@/components/socket-provider';
import { MonthGrid } from './components/MonthGrid';
import { TimeGridView } from './components/TimeGridView';
import { EventDetailPanel } from './components/EventDetailPanel';
import { EventForm } from './components/EventForm';
import { DateContextMenu } from './components/DateContextMenu';
import { EventContextMenu } from './components/EventContextMenu';
import { FilterBar } from './components/FilterBar';
import { ViewToggle } from './components/ViewToggle';
import { ListView } from './components/ListView';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay, format, parseISO } from 'date-fns';
import { useSession } from '../context/session-context';
import { getEventForEdit, duplicateEvent, deleteEvent } from './actions';
import type { EventForEditItem } from './actions';
import type { CalendarItem } from './types';

type ViewMode = 'month' | 'week' | 'day' | 'list';

interface CalendarFilters {
  employeeId?: string;
  kinds?: string[];
  search?: string;
  priority?: string[];
  clientName?: string;
}

interface CalendarViewProps {
  employees: Array<{ id: string; fullName: string; employeeNumber: string }>;
  admins: Array<{ id: string; name: string; email: string }>;
}

export function CalendarView({ employees, admins }: CalendarViewProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [view, setView] = useState<ViewMode>(() => {
    const v = searchParams.get('view');
    return v === 'month' || v === 'week' || v === 'day' || v === 'list' ? v : 'month';
  });
  const [currentDate, setCurrentDate] = useState(() => {
    const d = searchParams.get('date');
    if (d) {
      const parsed = parseISO(d);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  });
  const [selectedEvent, setSelectedEvent] = useState<CalendarItem | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createDefaults, setCreateDefaults] = useState<{ date: string; time?: string } | null>(null);
  const [editEventId, setEditEventId] = useState<string | null>(null);
  const [editInitialData, setEditInitialData] = useState<EventForEditItem | null>(null);
  const [editFetching, setEditFetching] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ date: string; time?: string; x: number; y: number } | null>(null);
  const [eventContextMenu, setEventContextMenu] = useState<{ item: CalendarItem; x: number; y: number } | null>(null);
  const [duplicateFromEvent, setDuplicateFromEvent] = useState<EventForEditItem | null>(null);
  const [duplicateFetching, setDuplicateFetching] = useState(false);
  const [filters, setFilters] = useState<CalendarFilters>({});
  const queryClient = useQueryClient();
  const session = useSession();
  const { socket } = useSocket();

  const dateRange = useMemo(() => {
    if (view === 'month' || view === 'list') {
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
      return res.json() as Promise<{ items: CalendarItem[]; dayCounts: Record<string, number> }>;
    },
    staleTime: 30000,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!socket) return;
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'calendar'] });
    };
    socket.on('calendar_changed', handler);
    return () => {
      socket.off('calendar_changed', handler);
    };
  }, [socket, queryClient]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('view', view);
    params.set('date', format(currentDate, 'yyyy-MM-dd'));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [view, currentDate, pathname, router]);

  const items = itemsData?.items ?? [];
  const daySummaryMap = useMemo(() => {
    const map = new Map<string, number>();
    const counts = itemsData?.dayCounts;
    if (counts) {
      for (const [date, count] of Object.entries(counts)) {
        map.set(date, count);
      }
    }
    return map;
  }, [itemsData]);

  const handleEventClick = useCallback((item: CalendarItem) => {
    setSelectedEvent(item);
  }, []);

  const handleDateClick = useCallback((date: string) => {
    setCurrentDate(startOfDay(parseISO(date)));
    setView('day');
  }, []);

  const handleSlotSelect = useCallback((date: string, time: string) => {
    setCurrentDate(startOfDay(parseISO(date)));
    setSelectedEvent(null);
    setCreateDefaults({ date, time });
    setShowCreateModal(true);
  }, []);

  const handleDateContextMenu = useCallback((date: string, _event: MouseEvent) => {
    setContextMenu({ date, x: _event.clientX, y: _event.clientY });
  }, []);

  const handleSlotContextMenu = useCallback((date: string, time: string, _event: MouseEvent) => {
    setContextMenu({ date, time, x: _event.clientX, y: _event.clientY });
  }, []);

  const handleEditEvent = useCallback(async (eventId: string) => {
    setEditFetching(true);
    setEditEventId(eventId);
    setEditInitialData(null);
    setSelectedEvent(null);
    const result = await getEventForEdit(eventId);
    if (!result.success) {
      setEditFetching(false);
      setEditEventId(null);
      return;
    }
    setEditInitialData(result.item);
    setEditFetching(false);
  }, []);

  const handleEventContextMenu = useCallback((item: CalendarItem, clientX: number, clientY: number) => {
    setEventContextMenu({ item, x: clientX, y: clientY });
  }, []);

  const handleViewFromContextMenu = useCallback(() => {
    if (!eventContextMenu) return;
    setSelectedEvent(eventContextMenu.item);
    setEventContextMenu(null);
  }, [eventContextMenu]);

  const handleEditFromContextMenu = useCallback(() => {
    if (!eventContextMenu) return;
    const eventId = eventContextMenu.item.originalId;
    setEventContextMenu(null);
    handleEditEvent(eventId);
  }, [eventContextMenu, handleEditEvent]);

  const handleDuplicate = useCallback(async (eventId: string) => {
    setEventContextMenu(null);
    setSelectedEvent(null);
    setDuplicateFetching(true);
    const result = await getEventForEdit(eventId);
    setDuplicateFetching(false);
    if (result.success) {
      setDuplicateFromEvent(result.item);
    } else {
      toast.error('Could not load event for duplication');
    }
  }, []);

  const handleDeleteFromContextMenu = useCallback(async () => {
    if (!eventContextMenu) return;
    const eventId = eventContextMenu.item.originalId;
    setEventContextMenu(null);
    const result = await deleteEvent(eventId);
    if (result.success) {
      toast.success('Event deleted');
      queryClient.invalidateQueries({ queryKey: ['admin', 'calendar'] });
      setSelectedEvent(prev => (prev?.originalId === eventId ? null : prev));
    }
  }, [eventContextMenu, queryClient]);

  const handleFormSuccess = useCallback(() => {
    setShowCreateModal(false);
    setEditEventId(null);
    queryClient.invalidateQueries({ queryKey: ['admin', 'calendar'] });
  }, [queryClient]);

  return (
    <div className="mx-auto grid h-full w-full max-w-[105rem] grid-cols-1 gap-4 min-[1680px]:grid-cols-[minmax(0,80rem)_24rem]">
      <div className="flex min-h-0 min-w-0 flex-col space-y-4">
        <div className="flex items-center justify-between">
          <FilterBar filters={filters} onFiltersChange={setFilters} initialEmployees={employees} />
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
            onDateContextMenu={session.hasPermission('user-calendar:create') ? handleDateContextMenu : undefined}
            onEventContextMenu={handleEventContextMenu}
          />
        )}
        {(view === 'week' || view === 'day') && (
          <TimeGridView
            key={view}
            currentDate={currentDate}
            viewType={view === 'week' ? 'timeGridWeek' : 'timeGridDay'}
            items={items}
            onEventClick={handleEventClick}
            onSlotSelect={session.hasPermission('user-calendar:create') ? handleSlotSelect : undefined}
            onSlotContextMenu={session.hasPermission('user-calendar:create') ? handleSlotContextMenu : undefined}
            onEventContextMenu={handleEventContextMenu}
          />
        )}
        {view === 'list' && (
          <ListView items={items} onEventClick={handleEventClick} onEventContextMenu={handleEventContextMenu} />
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

      {/* Inline panel (≥ 1680px) */}
      {selectedEvent && (
        <div className="hidden min-h-0 min-[1680px]:block">
          <EventDetailPanel
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
            onEdit={handleEditEvent}
            onDelete={handleFormSuccess}
            onDuplicate={() => handleDuplicate(selectedEvent.originalId)}
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
            hasDuplicatePermission={
              session.hasPermission('user-calendar:create') &&
              selectedEvent.ownerType === 'admin' &&
              selectedEvent.ownerId === session.userId
            }
          />
        </div>
      )}

      {/* Drawer fallback (< 1680px) */}
      {selectedEvent && (
        <div className="fixed inset-y-0 right-0 z-30 flex w-full max-w-sm items-center p-4 min-[1680px]:hidden">
          <EventDetailPanel
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
            onEdit={handleEditEvent}
            onDelete={handleFormSuccess}
            onDuplicate={() => handleDuplicate(selectedEvent.originalId)}
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
            hasDuplicatePermission={
              session.hasPermission('user-calendar:create') &&
              selectedEvent.ownerType === 'admin' &&
              selectedEvent.ownerId === session.userId
            }
          />
        </div>
      )}

      {showCreateModal && (
        <EventForm
          defaultDate={createDefaults?.date ?? format(currentDate, 'yyyy-MM-dd')}
          defaultStartTime={createDefaults?.time}
          onClose={() => {
            setShowCreateModal(false);
            setCreateDefaults(null);
          }}
          onSuccess={handleFormSuccess}
          initialAdmins={admins}
        />
      )}

      {(editFetching || duplicateFetching) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-lg border border-border bg-card p-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </div>
      )}

      {contextMenu && (
        <DateContextMenu
          date={contextMenu.date}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onAddNewEvent={() => {
            setCreateDefaults({ date: contextMenu.date, time: contextMenu.time });
            setShowCreateModal(true);
          }}
          onViewDay={
            contextMenu.time
              ? undefined
              : () => {
                  handleDateClick(contextMenu.date);
                  setContextMenu(null);
                }
          }
        />
      )}

      {eventContextMenu && (
        <EventContextMenu
          event={eventContextMenu.item}
          x={eventContextMenu.x}
          y={eventContextMenu.y}
          onClose={() => setEventContextMenu(null)}
          onView={handleViewFromContextMenu}
          onEdit={handleEditFromContextMenu}
          onDuplicate={() => handleDuplicate(eventContextMenu.item.originalId)}
          onDelete={handleDeleteFromContextMenu}
          hasEditPermission={
            session.hasPermission('user-calendar:edit') &&
            eventContextMenu.item.ownerType === 'admin' &&
            eventContextMenu.item.ownerId === session.userId
          }
          hasDeletePermission={
            session.hasPermission('user-calendar:delete') &&
            eventContextMenu.item.ownerType === 'admin' &&
            eventContextMenu.item.ownerId === session.userId
          }
          hasDuplicatePermission={
            session.hasPermission('user-calendar:create') &&
            eventContextMenu.item.ownerType === 'admin' &&
            eventContextMenu.item.ownerId === session.userId
          }
        />
      )}

      {editEventId && !editFetching && (
        <EventForm
          key={editEventId}
          eventId={editEventId}
          initialEvent={editInitialData}
          onClose={() => {
            setEditEventId(null);
            setEditInitialData(null);
          }}
          onSuccess={handleFormSuccess}
          initialAdmins={admins}
        />
      )}

      {duplicateFromEvent && !duplicateFetching && (
        <EventForm
          key={`duplicate-${duplicateFromEvent.ownerId}-${duplicateFromEvent.createdAt}`}
          duplicateFrom={duplicateFromEvent}
          onClose={() => setDuplicateFromEvent(null)}
          onSuccess={() => {
            setDuplicateFromEvent(null);
            queryClient.invalidateQueries({ queryKey: ['admin', 'calendar'] });
          }}
          initialAdmins={admins}
        />
      )}
    </div>
  );
}
