import { memo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addMonths, addWeeks, addDays, format } from 'date-fns';

type ViewMode = 'month' | 'week' | 'day';

interface ViewToggleProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  currentDate: Date;
  onDateChange: (date: Date) => void;
}

export const ViewToggle = memo(function ViewToggle({ view, onViewChange, currentDate, onDateChange }: ViewToggleProps) {
  const navigate = (direction: 'prev' | 'next') => {
    const delta = direction === 'next' ? 1 : -1;
    if (view === 'month') onDateChange(addMonths(currentDate, delta));
    else if (view === 'week') onDateChange(addWeeks(currentDate, delta));
    else onDateChange(addDays(currentDate, delta));
  };

  const title = format(
    currentDate,
    view === 'day' ? 'EEEE, MMMM d, yyyy' : view === 'week' ? "'Week of' MMM d, yyyy" : 'MMMM yyyy'
  );

  return (
    <div className="flex items-center gap-2">
      <div className="flex rounded-lg border border-input">
        {(['month', 'week', 'day'] as const).map(v => (
          <button
            key={v}
            onClick={() => onViewChange(v)}
            className={`px-3 py-1.5 text-xs font-medium capitalize ${
              view === v ? 'bg-red-600 text-white' : 'text-muted-foreground hover:text-foreground'
            } ${v === 'month' ? 'rounded-l-lg' : ''} ${v === 'day' ? 'rounded-r-lg' : ''}`}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => navigate('prev')}
          aria-label="Previous"
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-32 text-center text-sm font-medium text-foreground">{title}</span>
        <button
          onClick={() => navigate('next')}
          aria-label="Next"
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <button
        onClick={() => onDateChange(new Date())}
        aria-label="Today"
        className="rounded-lg border border-input px-3 py-1.5 text-xs text-foreground hover:border-ring/50 hover:text-foreground"
      >
        Today
      </button>
    </div>
  );
});
