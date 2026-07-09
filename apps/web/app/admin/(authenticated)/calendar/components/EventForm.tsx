'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { X } from 'lucide-react';
import { format } from 'date-fns';
import {
  KINDS_WITH_END_DATE,
  KINDS_WITH_TIME,
  KINDS_WITH_LOCATION,
  KINDS_WITH_PRIORITY,
  CalendarEventKind,
} from '@repo/shared';
import { createCalendarEventSchema, updateCalendarEventSchema } from '@repo/validations';
import { createEvent, updateEvent } from '../actions';
import { DatePicker } from '@/components/ui/date-picker';
import { TimePicker } from '@/components/ui/time-picker';
import AddressAutocompleteInput from '@/components/address-autocomplete-input';
import AddressMapPreview from '@/components/address-map-preview';
import { EventTypeChips } from './EventTypeChips';
import { EventReminderSection } from './EventReminderSection';
import { EventTaggingSection } from './EventTaggingSection';
import { EventFormActions } from './EventFormActions';

import type { EventForEditItem } from '../actions';

interface EventFormProps {
  eventId?: string;
  initialEvent?: EventForEditItem | null;
  defaultDate?: string;
  defaultStartTime?: string;
  onClose: () => void;
  onSuccess: () => void;
  initialAdmins: Array<{ id: string; name: string; email: string }>;
}

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
  locationLatitude: number | null;
  locationLongitude: number | null;
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
  startDate: '',
  endDate: '',
  startTime: '09:00',
  endTime: '10:00',
  allDay: false,
  location: '',
  locationLatitude: null,
  locationLongitude: null,
  clientName: '',
  trainerName: '',
  priority: 'normal',
  color: '#FF3B30',
  taggedEmployeeIds: [],
  taggedAdminIds: [],
  reminderMinutesBefore: null,
};

function todayStr() {
  return format(new Date(), 'yyyy-MM-dd');
}

function buildFormState(
  initialEvent: EventForEditItem | null | undefined,
  defaultDate?: string,
  defaultStartTime?: string
) {
  if (initialEvent) {
    const startDate = initialEvent.startDate ?? todayStr();
    const endDate = initialEvent.endDate ?? todayStr();
    return {
      form: {
        kind: initialEvent.kind ?? 'meeting',
        title: initialEvent.title ?? '',
        description: initialEvent.description ?? '',
        startDate,
        endDate,
        startTime: initialEvent.startTime ?? '',
        endTime: initialEvent.endTime ?? '',
        allDay: initialEvent.allDay ?? false,
        location: initialEvent.location ?? '',
        locationLatitude: initialEvent.latitude ?? null,
        locationLongitude: initialEvent.longitude ?? null,
        clientName: initialEvent.clientName ?? '',
        trainerName: initialEvent.trainerName ?? '',
        priority: initialEvent.priority ?? 'normal',
        color: initialEvent.color ?? '#FF3B30',
        taggedEmployeeIds: [],
        taggedAdminIds: (initialEvent.taggedUsers ?? [])
          .filter((u: { type: string }) => u.type === 'admin')
          .map((u: { id: string }) => u.id),
        reminderMinutesBefore: initialEvent.reminderMinutesBefore ?? null,
      } satisfies FormData,
      startDateObj: new Date(startDate + 'T00:00:00'),
      endDateObj: new Date(endDate + 'T00:00:00'),
    };
  }
  return {
    form: {
      ...EMPTY_FORM,
      startDate: defaultDate ?? todayStr(),
      endDate: defaultDate ?? todayStr(),
      startTime: defaultStartTime ?? '09:00',
    } satisfies FormData,
    startDateObj: defaultDate ? new Date(defaultDate + 'T00:00:00') : new Date(),
    endDateObj: defaultDate ? new Date(defaultDate + 'T00:00:00') : new Date(),
  };
}

export function EventForm({
  eventId,
  initialEvent,
  defaultDate,
  defaultStartTime,
  onClose,
  onSuccess,
  initialAdmins,
}: EventFormProps) {
  const [{ form, startDateObj, endDateObj }, setFormState] = useState(() =>
    buildFormState(initialEvent, defaultDate, defaultStartTime)
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const modalRef = useRef<HTMLDivElement>(null);

  const setForm = (updater: FormData | ((prev: FormData) => FormData)) => {
    setFormState(prev => ({
      ...prev,
      form: typeof updater === 'function' ? updater(prev.form) : updater,
    }));
  };

  const kind = form.kind as CalendarEventKind;
  const showEndDate = KINDS_WITH_END_DATE.has(kind);
  const showStartTime = KINDS_WITH_TIME.has(kind);
  const showEndTime = KINDS_WITH_TIME.has(kind) && showEndDate;
  const showLocation = KINDS_WITH_LOCATION.has(kind);
  const showPriority = KINDS_WITH_PRIORITY.has(kind);
  const showClientName = form.kind === 'client_meeting' || form.kind === 'follow_up';
  const showTrainerName = form.kind === 'training';

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

  const handleKindChange = (kind: string) => {
    setForm(prev => ({
      ...prev,
      kind,
      clientName: kind === 'client_meeting' ? prev.clientName : '',
      trainerName: kind === 'training' ? prev.trainerName : '',
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    if (showEndDate && form.startDate > form.endDate) {
      setFieldErrors({ endDate: 'End date cannot be earlier than start date' });
      return;
    }

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
    if (showLocation && form.location) {
      body.location = form.location;
      if (form.locationLatitude != null) body.latitude = form.locationLatitude;
      if (form.locationLongitude != null) body.longitude = form.locationLongitude;
    }
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
        if (!errors[path]) errors[path] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    startTransition(async () => {
      const result = eventId ? await updateEvent(eventId, body) : await createEvent(body);

      if (result.success) {
        onSuccess();
      } else {
        setError(typeof result.error === 'string' ? result.error : JSON.stringify(result.error));
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-form-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-card p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="event-form-title" className="text-lg font-semibold text-foreground">
            {eventId ? 'Edit Event' : 'New Event'}
          </h2>
          <button onClick={onClose} aria-label="Close dialog" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <EventTypeChips selected={form.kind} onChange={handleKindChange} />

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
              <DatePicker
                date={startDateObj}
                maxDate={showEndDate ? endDateObj : undefined}
                setDate={d => {
                  const dateStr = format(d ?? new Date(), 'yyyy-MM-dd');
                  setFormState(prev => ({ ...prev, startDateObj: d ?? new Date() }));
                  setForm(p => ({ ...p, startDate: dateStr }));
                  if (showEndDate && dateStr > form.endDate) {
                    setFieldErrors(p => ({ ...p, endDate: 'End date cannot be earlier than start date' }));
                  } else {
                    setFieldErrors(p => ({ ...p, endDate: '' }));
                  }
                }}
              />
              {fieldErrors.startDate && <p className="mt-1 text-xs text-red-400">{fieldErrors.startDate}</p>}
            </div>
            {showEndDate && (
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">End Date *</label>
                <DatePicker
                  date={endDateObj}
                  minDate={startDateObj}
                  setDate={d => {
                    const dateStr = format(d ?? new Date(), 'yyyy-MM-dd');
                    setFormState(prev => ({ ...prev, endDateObj: d ?? new Date() }));
                    setForm(p => ({ ...p, endDate: dateStr }));
                    if (dateStr < form.startDate) {
                      setFieldErrors(p => ({ ...p, endDate: 'End date cannot be earlier than start date' }));
                    } else {
                      setFieldErrors(p => ({ ...p, endDate: '' }));
                    }
                  }}
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
                  <TimePicker
                    value={form.startTime}
                    onChange={v => setForm(p => ({ ...p, startTime: v }))}
                    use24h
                    className={`w-full ${fieldErrors.startTime ? '**:data-[slot=trigger]:border-red-500' : ''}`}
                  />
                  {fieldErrors.startTime && <p className="mt-1 text-xs text-red-400">{fieldErrors.startTime}</p>}
                </div>
              )}
              {showEndTime && (
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">End Time</label>
                  <TimePicker
                    value={form.endTime}
                    onChange={v => setForm(p => ({ ...p, endTime: v }))}
                    use24h
                    className={`w-full ${fieldErrors.endTime ? '**:data-[slot=trigger]:border-red-500' : ''}`}
                  />
                  {fieldErrors.endTime && <p className="mt-1 text-xs text-red-400">{fieldErrors.endTime}</p>}
                </div>
              )}
            </div>
          )}

          <EventReminderSection
            reminderMinutesBefore={form.reminderMinutesBefore}
            onChange={value => setForm(p => ({ ...p, reminderMinutesBefore: value }))}
          />

          {showLocation && (
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Location</label>
              <AddressAutocompleteInput
                value={form.location}
                onChange={v => setForm(p => ({ ...p, location: v }))}
                onPlaceSelect={(address, lat, lng) => {
                  setForm(p => ({ ...p, location: address, locationLatitude: lat, locationLongitude: lng }));
                }}
                placeholder="Search address..."
              />
              {form.locationLatitude != null && form.locationLongitude != null && (
                <div className="mt-2">
                  <AddressMapPreview
                    latitude={form.locationLatitude}
                    longitude={form.locationLongitude}
                    onLocationChange={(lat, lng) => {
                      setForm(p => ({ ...p, locationLatitude: lat, locationLongitude: lng }));
                    }}
                  />
                </div>
              )}
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
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
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

          <EventTaggingSection
            taggedAdminIds={form.taggedAdminIds}
            onChange={ids => setForm(p => ({ ...p, taggedAdminIds: ids }))}
            initialAdmins={initialAdmins}
          />

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

          <EventFormActions loading={isPending} isEdit={!!eventId} onCancel={onClose} />
        </form>
      </div>
    </div>
  );
}
