import { X, Calendar, Clock, MapPin, User, Tag } from 'lucide-react';
import type { CalendarItem } from '../types';

interface EventDetailPanelProps {
  event: CalendarItem;
  onClose: () => void;
  onEdit: (eventId: string) => void;
  onDelete: () => void;
  hasEditPermission: boolean;
  hasDeletePermission: boolean;
}

const KIND_LABELS: Record<string, string> = {
  holiday: 'Holiday',
  office_memo: 'Office Memo',
  leave: 'Leave',
  meeting: 'Meeting',
  client_meeting: 'Client Meeting',
  reminder: 'Reminder',
  task: 'Task',
  deadline: 'Deadline',
  follow_up: 'Follow-up',
  training: 'Training',
  personal_event: 'Personal Event',
  other: 'Other',
};

export function EventDetailPanel({ event, onClose, onEdit, onDelete, hasEditPermission, hasDeletePermission }: EventDetailPanelProps) {
  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this event?')) return;
    try {
      const res = await fetch(`/api/admin/calendar/events/${event.originalId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onDelete();
      }
    } catch (err) {
      console.error('Failed to delete event:', err);
    }
  };

  return (
    <div className="w-96 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <h3 className="font-medium text-foreground">{KIND_LABELS[event.kind] ?? event.kind}</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 py-4">
        <h2 className="text-lg font-semibold text-foreground">{event.title}</h2>

        <div className="space-y-2 text-sm text-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>{event.date}</span>
            {!event.allDay && event.startsAt && (
              <>
                <Clock className="ml-2 h-4 w-4 text-muted-foreground" />
                <span>
                  {event.startsAt.slice(11, 16)}
                  {event.endsAt ? ` - ${event.endsAt.slice(11, 16)}` : ''}
                </span>
              </>
            )}
          </div>

          {event.location && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{event.location}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span>{event.ownerName}</span>
            <span className={`ml-1 rounded px-1.5 py-0.5 text-xs ${
              event.ownerType === 'admin' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
            }`}>
              {event.ownerType === 'employee' ? 'Employee' : 'Admin'}
            </span>
          </div>

          {event.priority && event.priority !== 'normal' && (
            <div className="flex items-center gap-2">
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                event.priority === 'urgent' ? 'bg-red-500/20 text-red-400' :
                event.priority === 'high' ? 'bg-orange-500/20 text-orange-400' :
                'bg-muted text-muted-foreground'
              }`}>
                {event.priority.toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {event.taggedUsers && event.taggedUsers.length > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Tag className="h-3 w-3" />
              <span>Tagged users</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {event.taggedUsers.map((u) => (
                <span
                  key={u.id}
                  className={`rounded px-2 py-0.5 text-xs ${
                    u.type === 'admin'
                      ? 'bg-blue-500/10 text-blue-400'
                      : 'bg-green-500/10 text-green-400'
                  }`}
                >
                  {u.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {(hasEditPermission || hasDeletePermission) && (
        <div className="flex gap-2 border-t border-border pt-3">
          {hasEditPermission && (
            <button
              onClick={() => onEdit(event.originalId)}
              className="flex-1 rounded-lg bg-muted py-2 text-sm font-medium text-foreground hover:bg-muted/70"
            >
              Edit
            </button>
          )}
          {hasDeletePermission && (
            <button
              onClick={handleDelete}
              className="flex-1 rounded-lg bg-red-600/20 py-2 text-sm font-medium text-red-400 hover:bg-red-600/30"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
