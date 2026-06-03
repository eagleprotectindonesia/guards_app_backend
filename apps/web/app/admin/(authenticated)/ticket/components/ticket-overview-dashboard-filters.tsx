import { useDebouncedCallback } from 'use-debounce';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, Search, SlidersHorizontal } from 'lucide-react';
import { PRIORITY_OPTIONS, STATUS_OPTIONS, toStatusLabel } from './ticket-overview-dashboard.utils';
import type { TicketOverviewFilters, TicketOverviewOptions } from './ticket-overview-dashboard.types';

type Props = {
  filters: TicketOverviewFilters;
  options: TicketOverviewOptions;
  onSearch: (value: string) => void;
  onFilterChange: (key: keyof TicketOverviewFilters, value: string) => void;
};

function FilterBlock({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-32.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={event => onChange(event.target.value)}
          className="h-10 w-full appearance-none rounded-lg border border-border/80 bg-zinc-950/40 px-3 pr-9 text-sm text-foreground focus:outline-none focus:border-border transition-colors"
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
      </div>
    </div>
  );
}

export function TicketOverviewFilters({ filters, options, onSearch, onFilterChange }: Props) {
  const handleSearch = useDebouncedCallback((value: string) => {
    onSearch(value);
  }, 500);

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between w-full">
      <div className="relative flex-1 min-w-65">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
        <input
          defaultValue={filters.q}
          onChange={event => handleSearch(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              handleSearch.flush();
            }
          }}
          placeholder="Search tickets by ID, subject, or client..."
          className="h-10 w-full rounded-lg border border-border/80 bg-zinc-950/40 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-border transition-colors"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center sm:gap-3 shrink-0">
        <FilterBlock
          label="Category"
          value={filters.department}
          onChange={value => onFilterChange('department', value)}
        >
          <option value="">All Categories</option>
          {options.departments.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </FilterBlock>

        <FilterBlock label="Status" value={filters.status} onChange={value => onFilterChange('status', value)}>
          <option value="">All Status</option>
          {STATUS_OPTIONS.map(option => (
            <option key={option} value={option}>
              {toStatusLabel(option)}
            </option>
          ))}
        </FilterBlock>

        <FilterBlock label="Priority" value={filters.priority} onChange={value => onFilterChange('priority', value)}>
          <option value="">All Priorities</option>
          {PRIORITY_OPTIONS.map(option => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </FilterBlock>

        <FilterBlock label="Assigned To" value={filters.assignee} onChange={value => onFilterChange('assignee', value)}>
          <option value="">All Users</option>
          {options.assignees.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </FilterBlock>

        {/* <div className="flex flex-col gap-1.5">
          <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wider text-transparent select-none">
            Filters
          </span>
          <Button
            type="button"
            variant="outline"
            className="h-10 gap-2 border-border/80 bg-zinc-950/40 px-4 text-sm font-medium text-foreground hover:bg-zinc-800/50 hover:text-foreground transition-colors"
          >
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground/80" />
            Filters
          </Button>
        </div> */}
      </div>
    </div>
  );
}
