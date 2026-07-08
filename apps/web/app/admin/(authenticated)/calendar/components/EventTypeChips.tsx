import { ALL_CALENDAR_EVENT_KINDS, KIND_LABELS } from '@repo/shared';

interface EventTypeChipsProps {
  selected: string;
  onChange: (kind: string) => void;
}

export function EventTypeChips({ selected, onChange }: EventTypeChipsProps) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">Event Type</label>
      <div className="flex flex-wrap gap-1.5">
        {ALL_CALENDAR_EVENT_KINDS.map(k => (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selected === k
                ? 'bg-red-600 text-white'
                : 'border border-input text-foreground hover:border-ring/50'
            }`}
          >
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>
    </div>
  );
}
