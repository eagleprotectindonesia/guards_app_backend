import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

const KIND_OPTIONS = [
  { value: 'meeting', label: 'Meeting' },
  { value: 'client_meeting', label: 'Client Meeting' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'task', label: 'Task' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'training', label: 'Training' },
  { value: 'personal_event', label: 'Personal' },
  { value: 'other', label: 'Other' },
];

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];

interface CalendarFilters {
  employeeId?: string;
  kinds?: string[];
  search?: string;
  priority?: string[];
  clientName?: string;
}

interface FilterBarProps {
  filters: CalendarFilters;
  onFiltersChange: (filters: CalendarFilters) => void;
}

interface EmployeeOption {
  id: string;
  fullName: string;
  employeeNumber: string;
}

export function FilterBar({ filters, onFiltersChange }: FilterBarProps) {
  const [searchInput, setSearchInput] = useState(filters.search ?? '');
  const [showKindDropdown, setShowKindDropdown] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const kindRef = useRef<HTMLDivElement>(null);
  const priorityRef = useRef<HTMLDivElement>(null);
  const employeeRef = useRef<HTMLDivElement>(null);

  const { data: employees } = useQuery<EmployeeOption[]>({
    queryKey: ['admin', 'employees', 'active-summary'],
    queryFn: async () => {
      const res = await fetch('/api/admin/employees');
      if (!res.ok) throw new Error('Failed to fetch employees');
      return res.json() as Promise<EmployeeOption[]>;
    },
    staleTime: 60000,
  });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (kindRef.current && !kindRef.current.contains(e.target as Node)) setShowKindDropdown(false);
      if (priorityRef.current && !priorityRef.current.contains(e.target as Node)) setShowPriorityDropdown(false);
      if (employeeRef.current && !employeeRef.current.contains(e.target as Node)) setShowEmployeeDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      onFiltersChange({ ...filters, search: value || undefined });
    }, 300);
  };

  const toggleKind = (kind: string) => {
    const current = filters.kinds ?? [];
    const next = current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind];
    onFiltersChange({ ...filters, kinds: next.length > 0 ? next : undefined });
  };

  const togglePriority = (priority: string) => {
    const current = filters.priority ?? [];
    const next = current.includes(priority) ? current.filter((p) => p !== priority) : [...current, priority];
    onFiltersChange({ ...filters, priority: next.length > 0 ? next : undefined });
  };

  const clearFilters = () => {
    setSearchInput('');
    onFiltersChange({});
  };

  const hasAnyFilter = filters.search || filters.kinds?.length || filters.priority?.length || filters.employeeId || filters.clientName;

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search events..."
          className="w-56 rounded-lg border border-input bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-red-500 focus:outline-none"
        />
      </div>

      <div className="relative" ref={kindRef}>
        <button
          onClick={() => setShowKindDropdown(!showKindDropdown)}
          className={`rounded-lg border px-3 py-2 text-sm ${
            filters.kinds?.length ? 'border-red-600 bg-red-600/10 text-red-400' : 'border-input text-foreground hover:border-ring/50'
          }`}
        >
          {filters.kinds?.length ? `Kind (${filters.kinds.length})` : 'Kind'}
        </button>
        {showKindDropdown && (
          <div className="absolute left-0 top-full z-10 mt-1 w-44 rounded-lg border border-border bg-popover p-2 shadow-lg">
            {KIND_OPTIONS.map((k) => (
              <button
                key={k.value}
                onClick={() => toggleKind(k.value)}
                className={`flex w-full items-center rounded px-2 py-1.5 text-sm ${
                  filters.kinds?.includes(k.value) ? 'text-red-400' : 'text-foreground hover:bg-muted'
                }`}
              >
                {filters.kinds?.includes(k.value) && <span className="mr-2">✓</span>}
                {k.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative" ref={priorityRef}>
        <button
          onClick={() => setShowPriorityDropdown(!showPriorityDropdown)}
          className={`rounded-lg border px-3 py-2 text-sm ${
            filters.priority?.length ? 'border-red-600 bg-red-600/10 text-red-400' : 'border-input text-foreground hover:border-ring/50'
          }`}
        >
          {filters.priority?.length ? `Priority (${filters.priority.length})` : 'Priority'}
        </button>
        {showPriorityDropdown && (
          <div className="absolute left-0 top-full z-10 mt-1 w-36 rounded-lg border border-border bg-popover p-2 shadow-lg">
            {PRIORITY_OPTIONS.map((p) => (
              <button
                key={p.value}
                onClick={() => togglePriority(p.value)}
                className={`flex w-full items-center rounded px-2 py-1.5 text-sm ${
                  filters.priority?.includes(p.value) ? 'text-red-400' : 'text-foreground hover:bg-muted'
                }`}
              >
                {filters.priority?.includes(p.value) && <span className="mr-2">✓</span>}
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative" ref={employeeRef}>
        <button
          onClick={() => setShowEmployeeDropdown(!showEmployeeDropdown)}
          className={`rounded-lg border px-3 py-2 text-sm ${
            filters.employeeId ? 'border-red-600 bg-red-600/10 text-red-400' : 'border-input text-foreground hover:border-ring/50'
          }`}
        >
          {filters.employeeId ? 'Employee' : 'All Employees'}
        </button>
        {showEmployeeDropdown && (
          <div className="absolute left-0 top-full z-10 mt-1 max-h-64 w-64 overflow-y-auto rounded-lg border border-border bg-popover p-2 shadow-lg">
            <button
              onClick={() => { onFiltersChange({ ...filters, employeeId: undefined }); setShowEmployeeDropdown(false); }}
              className={`flex w-full items-center rounded px-2 py-1.5 text-sm ${!filters.employeeId ? 'text-red-400' : 'text-foreground hover:bg-muted'}`}
            >
              All Employees
            </button>
            {(employees ?? []).map((emp) => (
              <button
                key={emp.id}
                onClick={() => { onFiltersChange({ ...filters, employeeId: emp.id }); setShowEmployeeDropdown(false); }}
                className={`flex w-full items-center rounded px-2 py-1.5 text-sm ${
                  filters.employeeId === emp.id ? 'text-red-400' : 'text-foreground hover:bg-muted'
                }`}
              >
                <span className="truncate">{emp.fullName}</span>
                <span className="ml-auto text-xs text-muted-foreground">#{emp.employeeNumber}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {hasAnyFilter && (
        <button
          onClick={clearFilters}
          className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
          Clear
        </button>
      )}
    </div>
  );
}
