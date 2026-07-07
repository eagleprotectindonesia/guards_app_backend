'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Loader2 } from 'lucide-react';
import { ALL_CALENDAR_EVENT_KINDS, KIND_LABELS, KIND_COLORS, REMINDER_PRESETS } from '@repo/shared';
import { createCalendarEventSchema, updateCalendarEventSchema } from '@repo/validations';

interface EventFormProps {
  eventId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const KINDS = ALL_CALENDAR_EVENT_KINDS.map(k => ({
  value: k,
  label: KIND_LABELS[k],
  defaultColor: KIND_COLORS[k],
}));

const COLORS = ['#FF3B30', '#FF2D55', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#5AC8FA', '#AF52DE'];

interface FormData {
  kind: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  location: string;
  clientName: string;
  trainerName: string;
  priority: string;
  color: string;
  taggedEmployeeIds: string[];
  taggedAdminIds: string[];
  reminderMinutesBefore: number | null;
}

const EMPTY_FORM: FormData = {
  kind: 'meeting',
  title: '',
  description: '',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date().toISOString().slice(0, 10),
  startTime: '09:00',
  endTime: '10:00',
  allDay: false,
  location: '',
  clientName: '',
  trainerName: '',
  priority: 'normal',
  color: '#FF3B30',
  taggedEmployeeIds: [],
  taggedAdminIds: [],
  reminderMinutesBefore: null,
};

export function EventForm({ eventId, onClose, onSuccess }: EventFormProps) {
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [initialLoading, setInitialLoading] = useState(!!eventId);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = modalRef.current;
    if (!el) return;
    const focusable = el.querySelectorAll<HTMLElement>(
      'input, textarea, select, button, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length > 0) focusable[0].focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    el.addEventListener('keydown', handleKey);
    return () => el.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    if (!eventId) return;
    fetch(`/api/admin/calendar/events/${eventId}`)
      .then(res => res.json())
      .then(data => {
        const item = data.item;
        setForm({
          kind: (item.kind as string) ?? 'meeting',
          title: (item.title as string) ?? '',
          description: (item.description as string) ?? '',
          startDate: (item.startDate as string) ?? new Date().toISOString().slice(0, 10),
          endDate: (item.endDate as string) ?? new Date().toISOString().slice(0, 10),
          startTime: (item.startTime as string) ?? '',
          endTime: (item.endTime as string) ?? '',
          allDay: (item.allDay as boolean) ?? false,
          location: (item.location as string) ?? '',
          clientName: (item.clientName as string) ?? '',
          trainerName: (item.trainerName as string) ?? '',
          priority: (item.priority as string) ?? 'normal',
          color: (item.color as string) ?? '#FF3B30',
          taggedEmployeeIds: [],
          taggedAdminIds: [],
          reminderMinutesBefore: (item.reminderMinutesBefore as number | null) ?? null,
        });
      })
      .catch(err => console.error('Failed to load event:', err))
      .finally(() => setInitialLoading(false));
  }, [eventId]);

  const handleKindChange = (kind: string) => {
    const k = KINDS.find(k => k.value === kind);
    setForm(prev => ({
      ...prev,
      kind,
      color: prev.color === EMPTY_FORM.color ? (k?.defaultColor ?? '#8E8E93') : prev.color,
      clientName: kind === 'client_meeting' ? prev.clientName : '',
      trainerName: kind === 'training' ? prev.trainerName : '',
    }));
  };

  const showEndDate = !['reminder', 'task', 'deadline'].includes(form.kind);
  const showStartTime = !['task', 'deadline'].includes(form.kind);
  const showEndTime = !['reminder', 'task', 'deadline'].includes(form.kind) && showEndDate;
  const showLocation = ['meeting', 'client_meeting', 'training', 'personal_event', 'other'].includes(form.kind);
  const showClientName = form.kind === 'client_meeting' || form.kind === 'follow_up';
  const showTrainerName = form.kind === 'training';
  const showPriority = !['reminder'].includes(form.kind);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setFieldErrors({});

    const body: Record<string, unknown> = {
      kind: form.kind,
      title: form.title,
      description: form.description || undefined,
      startDate: form.startDate,
      endDate: showEndDate ? form.endDate : form.startDate,
      startTime: !form.allDay && showStartTime && form.startTime ? form.startTime : undefined,
      endTime: !form.allDay && showEndTime && form.endTime ? form.endTime : undefined,
      allDay: form.allDay,
      priority: form.priority === 'normal' ? undefined : form.priority,
      color: form.color || undefined,
      taggedEmployeeIds: form.taggedEmployeeIds.length > 0 ? form.taggedEmployeeIds : undefined,
      taggedAdminIds: form.taggedAdminIds.length > 0 ? form.taggedAdminIds : undefined,
    };
    if (showLocation && form.location) body.location = form.location;
    if (showClientName && form.clientName) body.clientName = form.clientName;
    if (showTrainerName && form.trainerName) body.trainerName = form.trainerName;

    if (form.reminderMinutesBefore !== null) {
      body.reminderMinutesBefore = form.reminderMinutesBefore;
    }

    const schema = eventId ? updateCalendarEventSchema : createCalendarEventSchema;
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        if (!errors[path]) {
          errors[path] = issue.message;
        }
      }
      setFieldErrors(errors);
      setLoading(false);
      return;
    }

    try {
      const url = eventId ? `/api/admin/calendar/events/${eventId}` : '/api/admin/calendar/events';
      const method = eventId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to save event');
      }

      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="rounded-lg border border-border bg-card p-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        ref={modalRef}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-card p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{eventId ? 'Edit Event' : 'New Event'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Event Type</label>
            <div className="flex flex-wrap gap-1.5">
              {KINDS.map(k => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => handleKindChange(k.value)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    form.kind === k.value
                      ? 'bg-red-600 text-white'
                      : 'border border-input text-foreground hover:border-ring/50'
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Title *</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              className={`w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none ${fieldErrors.title ? 'border-red-500' : 'border-input focus:border-red-500'}`}
              placeholder="Event title"
              maxLength={120}
            />
            {fieldErrors.title && <p className="mt-1 text-xs text-red-400">{fieldErrors.title}</p>}
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.allDay}
                onChange={e =>
                  setForm(p => ({
                    ...p,
                    allDay: e.target.checked,
                    startTime: e.target.checked ? '' : p.startTime,
                    endTime: e.target.checked ? '' : p.endTime,
                  }))
                }
                className="rounded border-input bg-card text-red-600 focus:ring-red-500"
              />
              All day
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Start Date *</label>
              <input
                type="date"
                required
                value={form.startDate}
                onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))}
                className={`w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground focus:outline-none ${fieldErrors.startDate ? 'border-red-500' : 'border-input focus:border-red-500'}`}
              />
              {fieldErrors.startDate && <p className="mt-1 text-xs text-red-400">{fieldErrors.startDate}</p>}
            </div>
            {showEndDate && (
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">End Date *</label>
                <input
                  type="date"
                  required
                  value={form.endDate}
                  onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                  className={`w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground focus:outline-none ${fieldErrors.endDate ? 'border-red-500' : 'border-input focus:border-red-500'}`}
                />
                {fieldErrors.endDate && <p className="mt-1 text-xs text-red-400">{fieldErrors.endDate}</p>}
              </div>
            )}
          </div>

          {!form.allDay && (
            <div className="grid grid-cols-2 gap-3">
              {showStartTime && (
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Start Time</label>
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))}
                    className={`w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground focus:outline-none ${fieldErrors.startTime ? 'border-red-500' : 'border-input focus:border-red-500'}`}
                  />
                  {fieldErrors.startTime && <p className="mt-1 text-xs text-red-400">{fieldErrors.startTime}</p>}
                </div>
              )}
              {showEndTime && (
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">End Time</label>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))}
                    className={`w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground focus:outline-none ${fieldErrors.endTime ? 'border-red-500' : 'border-input focus:border-red-500'}`}
                  />
                  {fieldErrors.endTime && <p className="mt-1 text-xs text-red-400">{fieldErrors.endTime}</p>}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Reminder</label>
            <select
              value={form.reminderMinutesBefore === null ? '' : String(form.reminderMinutesBefore)}
              onChange={e => {
                const val = e.target.value;
                setForm(p => ({
                  ...p,
                  reminderMinutesBefore: val === '' ? null : val === '-1' ? -1 : Number(val),
                }));
              }}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-red-500 focus:outline-none"
            >
              <option value="">No reminder</option>
              {REMINDER_PRESETS.map(p => (
                <option key={p.minutes} value={p.minutes}>
                  {p.labelKey === 'reminderAtEvent' && 'At event time'}
                  {p.labelKey === 'reminder10Min' && '10 minutes before'}
                  {p.labelKey === 'reminder30Min' && '30 minutes before'}
                  {p.labelKey === 'reminder1Hour' && '1 hour before'}
                  {p.labelKey === 'reminder1Day' && '1 day before'}
                  {p.labelKey === 'reminder3Days' && '3 days before'}
                  {p.labelKey === 'reminder1Week' && '1 week before'}
                </option>
              ))}
              <option value="-1">Custom...</option>
            </select>
            {form.reminderMinutesBefore === -1 && (
              <div className="mt-2">
                <input
                  type="number"
                  min={0}
                  value={form.reminderMinutesBefore === -1 ? '' : (form.reminderMinutesBefore ?? '')}
                  onChange={e => setForm(p => ({ ...p, reminderMinutesBefore: Number(e.target.value) || 0 }))}
                  className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-red-500 focus:outline-none"
                  placeholder="Minutes before event"
                />
              </div>
            )}
          </div>

          {showLocation && (
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-red-500 focus:outline-none"
                placeholder="Location"
              />
            </div>
          )}

          {showClientName && (
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Client Name</label>
              <input
                type="text"
                value={form.clientName}
                onChange={e => setForm(p => ({ ...p, clientName: e.target.value }))}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-red-500 focus:outline-none"
                placeholder="Client name"
              />
            </div>
          )}

          {showTrainerName && (
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Trainer</label>
              <input
                type="text"
                value={form.trainerName}
                onChange={e => setForm(p => ({ ...p, trainerName: e.target.value }))}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-red-500 focus:outline-none"
                placeholder="Trainer name"
              />
            </div>
          )}

          {showPriority && (
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Priority</label>
              <select
                value={form.priority}
                onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-red-500 focus:outline-none"
              >
                <option value="normal">Normal</option>
                <option value="low">Low</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Color</label>
            <div className="flex gap-2">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, color: c }))}
                  className={`h-7 w-7 rounded-full transition-transform ${
                    form.color === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-card' : ''
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-red-500 focus:outline-none"
              placeholder="Add a description..."
              rows={3}
              maxLength={2000}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-input py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : eventId ? 'Save Changes' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
