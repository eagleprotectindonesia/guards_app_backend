'use client';

import type { ReactNode } from 'react';

type FilterBarProps = {
  children: ReactNode;
  onApply: () => void;
  onClear: () => void;
};

export default function FilterBar({ children, onApply, onClear }: FilterBarProps) {
  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-4 mb-6">
      <div className="flex flex-wrap items-end gap-3">
        {children}
        <div className="flex items-end gap-2 flex-shrink-0 ml-auto">
          <button
            onClick={onApply}
            className="inline-flex items-center justify-center h-10 px-4 py-2 bg-foreground text-background text-sm font-bold rounded-lg hover:opacity-90 transition-colors shadow-sm"
          >
            Apply Filters
          </button>
          <button
            onClick={onClear}
            className="inline-flex items-center justify-center h-10 px-4 py-2 text-sm text-muted-foreground hover:text-foreground underline transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
