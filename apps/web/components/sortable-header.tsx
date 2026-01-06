'use client';

import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

type SortableHeaderProps = {
  label: string;
  field: string;
  currentSortBy?: string;
  currentSortOrder?: 'asc' | 'desc';
  onSort: (field: string) => void;
  className?: string;
};

export default function SortableHeader({
  label,
  field,
  currentSortBy,
  currentSortOrder,
  onSort,
  className = ''
}: SortableHeaderProps) {
  const isCurrentSortField = currentSortBy === field;
  
  return (
    <th
      className={`py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors ${className}`}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {isCurrentSortField ? (
          currentSortOrder === 'asc' ? 
            <ArrowUp className="w-4 h-4" /> : 
            <ArrowDown className="w-4 h-4" />
        ) : (
          <ArrowUpDown className="w-4 h-4" />
        )}
      </div>
    </th>
  );
}