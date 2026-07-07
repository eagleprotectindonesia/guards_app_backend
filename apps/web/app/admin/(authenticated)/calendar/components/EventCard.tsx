import { Clock, User } from 'lucide-react';
import type { CalendarItem } from '../types';

interface EventCardProps {
  item: CalendarItem;
  onClick: () => void;
}

const DEFAULT_COLORS: Record<string, string> = {
  meeting: '#FF3B30',
  client_meeting: '#FF2D55',
  reminder: '#FF9500',
  task: '#34C759',
  deadline: '#FF3B30',
  follow_up: '#FF9500',
  training: '#007AFF',
  personal_event: '#007AFF',
  other: '#AF52DE',
};

export function EventCard({ item, onClick }: EventCardProps) {
  const color = item.colorHint ?? DEFAULT_COLORS[item.kind] ?? '#8E8E93';

  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border border-border bg-card/50 p-3 text-left transition-colors hover:bg-muted"
    >
      <div className="flex items-start gap-3">
        <div className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
            {item.priority && item.priority !== 'normal' && (
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                item.priority === 'urgent' ? 'bg-red-500/20 text-red-400' :
                item.priority === 'high' ? 'bg-orange-500/20 text-orange-400' :
                'bg-muted text-muted-foreground'
              }`}>
                {item.priority}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            {!item.allDay && item.startsAt && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {item.startsAt.slice(11, 16)}
                {item.endsAt ? ` - ${item.endsAt.slice(11, 16)}` : ''}
              </span>
            )}
            {item.location && (
              <span className="truncate">{item.location}</span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <User className="h-3 w-3" />
            <span>{item.ownerName}</span>
            <span className={`ml-1 rounded px-1 py-0.5 text-[10px] ${
              item.ownerType === 'admin' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
            }`}>
              {item.ownerType === 'employee' ? 'Employee' : 'Admin'}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
