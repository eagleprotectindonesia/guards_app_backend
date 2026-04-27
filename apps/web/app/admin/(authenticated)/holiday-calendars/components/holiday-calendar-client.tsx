'use client';

import { useMemo, useState, useTransition } from 'react';
import { addMonths, eachDayOfInterval, endOfMonth, format, isSameDay, isWithinInterval, parseISO, startOfMonth, subMonths } from 'date-fns';
import { createHolidayCalendarEntryAction, deleteHolidayCalendarEntryAction, updateHolidayCalendarEntryAction } from '../actions';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import HolidayEntryModal, { type HolidayEntry, type HolidayType, type HolidayScope } from './holiday-entry-modal';

type Props = {
  initialMonth: string;
  entries: HolidayEntry[];
  departmentOptions: string[];
};

function startOfMonthGrid(date: Date) {
  const first = startOfMonth(date);
  const offset = first.getDay();
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  return start;
}

function typeBadgeClass(type: HolidayType) {
  if (type === 'holiday') return 'bg-green-100 text-green-700 border-green-200';
  if (type === 'week_off') return 'bg-slate-100 text-slate-700 border-slate-200';
  if (type === 'emergency') return 'bg-red-100 text-red-700 border-red-200';
  return 'bg-blue-100 text-blue-700 border-blue-200';
}

export default function HolidayCalendarClient({ initialMonth, entries, departmentOptions }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [monthDate, setMonthDate] = useState<Date>(parseISO(`${initialMonth}-01`));
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [editingEntry, setEditingEntry] = useState<HolidayEntry | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const navigateMonth = (nextMonth: Date) => {
    setMonthDate(nextMonth);
    router.push(`/admin/holiday-calendars?month=${format(nextMonth, 'yyyy-MM')}`);
  };

  const gridDays = useMemo(() => {
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const gridStart = startOfMonthGrid(monthDate);
    const gridEnd = new Date(gridStart);
    gridEnd.setDate(gridStart.getDate() + 41);

    return {
      monthStart,
      monthEnd,
      days: eachDayOfInterval({ start: gridStart, end: gridEnd }),
    };
  }, [monthDate]);

  const selectedDateEntries = useMemo(
    () =>
      entries.filter(entry => {
        const start = parseISO(entry.startDate);
        const end = parseISO(entry.endDate);
        return isWithinInterval(selectedDate, { start, end });
      }),
    [entries, selectedDate]
  );

  const openCreate = (date?: Date) => {
    if (date) setSelectedDate(date);
    setEditingEntry(null);
    setIsModalOpen(true);
  };

  const openEdit = (entry: HolidayEntry) => {
    setEditingEntry(entry);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string, title: string) => {
    if (!window.confirm(`Delete holiday entry "${title}"?`)) return;

    startTransition(async () => {
      const result = await deleteHolidayCalendarEntryAction(id);
      if (result.success) {
        toast.success(result.message || 'Deleted');
        router.refresh();
      } else {
        toast.error(result.message || 'Delete failed');
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Holiday Calendar</h1>
          <p className="text-sm text-muted-foreground mt-1">Define holiday rules with attendance and payroll flags.</p>
        </div>
        <button
          type="button"
          onClick={() => openCreate(selectedDate)}
          className="inline-flex items-center justify-center h-10 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
        >
          Add Entry
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-6">
        <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <button
              type="button"
              onClick={() => navigateMonth(subMonths(monthDate, 1))}
              className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted/40"
            >
              Prev
            </button>
            <div className="font-semibold text-foreground">{format(monthDate, 'MMMM yyyy')}</div>
            <button
              type="button"
              onClick={() => navigateMonth(addMonths(monthDate, 1))}
              className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted/40"
            >
              Next
            </button>
          </div>

          <div className="grid grid-cols-7 border-b border-border bg-muted/20 text-xs font-semibold text-muted-foreground">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="p-2 text-center">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {gridDays.days.map(day => {
              const dayEntries = entries.filter(entry => {
                const start = parseISO(entry.startDate);
                const end = parseISO(entry.endDate);
                return isWithinInterval(day, { start, end });
              });

              const inCurrentMonth = isWithinInterval(day, { start: gridDays.monthStart, end: gridDays.monthEnd });
              const isSelected = isSameDay(day, selectedDate);
              const isToday = isSameDay(day, new Date());

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => setSelectedDate(day)}
                  className={`min-h-28 border-r border-b border-border p-2 text-left align-top hover:bg-muted/20 ${
                    inCurrentMonth ? 'bg-card' : 'bg-muted/10 text-muted-foreground/70'
                  } ${isSelected ? 'ring-1 ring-blue-500 ring-inset' : ''} ${isToday ? 'bg-blue-50/30' : ''}`}
                >
                  <div className={`text-xs font-medium mb-1 inline-flex items-center justify-center ${isToday ? 'w-6 h-6 rounded-full bg-blue-600 text-white' : ''}`}>
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-1">
                    {dayEntries.slice(0, 2).map(entry => (
                      <div key={entry.id} className={`text-[10px] px-1.5 py-0.5 rounded border truncate ${typeBadgeClass(entry.type)}`}>
                        {entry.title}
                      </div>
                    ))}
                    {dayEntries.length > 2 && <div className="text-[10px] text-muted-foreground">+{dayEntries.length - 2} more</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-card rounded-xl shadow-sm border border-border">
          <div className="px-4 py-3 border-b border-border bg-muted/30">
            <h2 className="font-semibold text-foreground">{format(selectedDate, 'EEEE, MMM d, yyyy')}</h2>
          </div>

          <div className="p-4 space-y-3">
            {selectedDateEntries.length === 0 ? (
              <div className="text-sm text-muted-foreground">No holiday entries on this date.</div>
            ) : (
              selectedDateEntries.map(entry => (
                <div key={entry.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-foreground text-sm">{entry.title}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {format(parseISO(entry.startDate), 'MMM d')} - {format(parseISO(entry.endDate), 'MMM d, yyyy')}
                      </div>
                    </div>
                    <span className={`text-[10px] px-2 py-1 rounded border ${typeBadgeClass(entry.type)}`}>{entry.type}</span>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Scope: {entry.scope === 'all' ? 'All employees' : `Department (${entry.departmentKeys.join(', ')})`}
                  </div>
                  <div className="mt-2 flex gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded bg-muted">Paid: {entry.isPaid ? 'Yes' : 'No'}</span>
                    <span className="px-2 py-0.5 rounded bg-muted">Attendance: {entry.affectsAttendance ? 'Yes' : 'No'}</span>
                    <span className="px-2 py-0.5 rounded bg-muted">Notify: {entry.notificationRequired ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(entry)}
                      className="text-xs px-2 py-1 border border-border rounded hover:bg-muted/40"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleDelete(entry.id, entry.title)}
                      className="text-xs px-2 py-1 border border-red-200 text-red-700 rounded hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {isModalOpen && (
        <HolidayEntryModal
          entry={editingEntry}
          selectedDate={selectedDate}
          departmentOptions={departmentOptions}
          onClose={() => setIsModalOpen(false)}
          onSubmit={(entryId, formData) => {
            startTransition(async () => {
              const result = entryId
                ? await updateHolidayCalendarEntryAction(entryId, formData)
                : await createHolidayCalendarEntryAction(formData);

              if (result.success) {
                toast.success(result.message || 'Saved');
                setIsModalOpen(false);
                router.refresh();
              } else {
                toast.error(result.message || 'Save failed');
              }
            });
          }}
        />
      )}
    </div>
  );
}
