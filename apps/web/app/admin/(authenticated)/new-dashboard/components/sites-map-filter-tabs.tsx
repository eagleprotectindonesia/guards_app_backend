'use client';

import { Button } from '@/components/ui/button';

export type MapFilter = 'all' | 'active' | 'late' | 'missing' | 'sos' | 'none' | 'upcoming';

export const FILTER_TABS: { key: MapFilter; label: string; color: string }[] = [
  { key: 'all', label: 'All', color: '#94a3b8' },
  { key: 'active', label: 'Active Now', color: '#22c55e' },
  { key: 'late', label: 'Late', color: '#f97316' },
  { key: 'missing', label: 'Missing', color: '#dc2626' },
  { key: 'sos', label: 'SOS', color: '#ef4444' },
  { key: 'none', label: 'No shift active', color: '#6b7280' },
  { key: 'upcoming', label: 'Upcoming', color: '#eab308' },
];

type MapFilterTabsProps = {
  value: MapFilter;
  onChange: (value: MapFilter) => void;
  counts: Record<MapFilter, number>;
  className?: string;
};

export function MapFilterTabs({ value, onChange, counts, className = '' }: MapFilterTabsProps) {
  return (
    <div className={`inline-flex items-center gap-1 flex-wrap ${className}`}>
      {FILTER_TABS.map(tab => {
        const active = value === tab.key;
        return (
          <Button
            key={tab.key}
            variant="outline"
            size="sm"
            onClick={() => onChange(tab.key)}
            aria-pressed={active}
            className={`cursor-pointer h-7 px-2 text-xs font-medium ${active ? '' : 'border-muted bg-transparent text-muted-foreground shadow-none hover:bg-accent hover:text-accent-foreground'}`}
            style={
              active
                ? { backgroundColor: `${tab.color}1A`, borderColor: tab.color, color: tab.color }
                : undefined
            }
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tab.color }} />
            {tab.label} ({counts[tab.key]})
          </Button>
        );
      })}
    </div>
  );
}
