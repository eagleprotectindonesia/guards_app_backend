'use client';

import { useMemo, type ComponentType } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, ChevronLeft, ChevronRight, SlidersHorizontal, MoreVertical, Ticket, ShieldCheck, CircleDashed, CheckCircle2, TriangleAlert } from 'lucide-react';
import { cn } from '@repo/shared';
import { badgeClass } from './ticket-dashboard-utils';

const METRIC_ICONS = {
  ticket: Ticket,
  shield: ShieldCheck,
  progress: CircleDashed,
  resolved: CheckCircle2,
  breach: TriangleAlert,
} as const;

type OverviewMetric = {
  label: string;
  value: number;
  hint: string;
  icon: keyof typeof METRIC_ICONS;
  accentClass: string;
};

type DashboardRow = {
  id: string;
  code: string;
  title: string;
  category: string;
  clientName: string;
  clientLocation: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: string;
  assignedTo: string;
  createdAt: string;
};

type Props = {
  metrics: OverviewMetric[];
  rows: DashboardRow[];
  totalCount: number;
  filters: {
    q: string;
    departmentRoleId: string;
    status: string;
    priority: string;
    assignee: string;
  };
  options: {
    departments: Array<{ value: string; label: string }>;
    assignees: Array<{ value: string; label: string }>;
  };
};

export type { OverviewMetric };

function priorityClass(priority: DashboardRow['priority']) {
  if (priority === 'HIGH') return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
  if (priority === 'MEDIUM') return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
}

const STATUS_OPTIONS = ['NEW', 'ACKNOWLEDGED', 'WAITING_INFORMATION', 'IN_PROGRESS', 'SOLVED', 'CLOSED', 'CANNOT_RESOLVE'] as const;
const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH'] as const;

function toStatusLabel(value: string) {
  return value.replaceAll('_', ' ');
}

export function TicketOverviewDashboard({ metrics, rows, totalCount, filters, options }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const paramsBase = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(paramsBase.toString());
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    router.push(next.toString() ? `${pathname}?${next.toString()}` : pathname);
  }

  function applySearch(value: string) {
    setParam('q', value.trim());
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">All Tickets</h1>
        <p className="text-sm text-muted-foreground">View and manage all tickets from one place.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {metrics.map(metric => {
          const Icon: ComponentType<{ className?: string }> = METRIC_ICONS[metric.icon];
          return (
            <Card key={metric.label} className="border-border/60 bg-card/95 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{metric.label}</p>
                  <p className="text-4xl font-bold tracking-tight text-foreground">{metric.value}</p>
                  <p className="text-xs text-muted-foreground">{metric.hint}</p>
                </div>
                <div className={cn('rounded-xl border p-3', metric.accentClass)}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="overflow-hidden border-border/60 bg-card shadow-sm">
        <div className="border-b border-border/60 p-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,2.2fr)_repeat(4,minmax(0,1fr))_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                defaultValue={filters.q}
                onBlur={event => applySearch(event.currentTarget.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') applySearch(event.currentTarget.value);
                }}
                placeholder="Search tickets by ID, subject, or client..."
                className="h-11 w-full rounded-lg border border-border bg-background pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
            <div className="relative">
              <select
                value={filters.departmentRoleId}
                onChange={event => setParam('departmentRoleId', event.target.value)}
                className="h-11 w-full appearance-none rounded-lg border border-border bg-background px-3 pr-9 text-sm text-foreground focus:outline-none"
              >
                <option value="">Category (Department)</option>
                {options.departments.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronRight className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-muted-foreground" />
            </div>
            <div className="relative">
              <select
                value={filters.status}
                onChange={event => setParam('status', event.target.value)}
                className="h-11 w-full appearance-none rounded-lg border border-border bg-background px-3 pr-9 text-sm text-foreground focus:outline-none"
              >
                <option value="">Status</option>
                {STATUS_OPTIONS.map(option => (
                  <option key={option} value={option}>
                    {toStatusLabel(option)}
                  </option>
                ))}
              </select>
              <ChevronRight className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-muted-foreground" />
            </div>
            <div className="relative">
              <select
                value={filters.priority}
                onChange={event => setParam('priority', event.target.value)}
                className="h-11 w-full appearance-none rounded-lg border border-border bg-background px-3 pr-9 text-sm text-foreground focus:outline-none"
              >
                <option value="">Priority</option>
                {PRIORITY_OPTIONS.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <ChevronRight className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-muted-foreground" />
            </div>
            <div className="relative">
              <select
                value={filters.assignee}
                onChange={event => setParam('assignee', event.target.value)}
                className="h-11 w-full appearance-none rounded-lg border border-border bg-background px-3 pr-9 text-sm text-foreground focus:outline-none"
              >
                <option value="">Assigned To</option>
                {options.assignees.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronRight className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-muted-foreground" />
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-11 gap-2 border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-accent"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/20 text-left">
              <tr className="border-b border-border/60 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Ticket ID</th>
                <th className="px-4 py-3 font-semibold">Subject</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Site / Client</th>
                <th className="px-4 py-3 font-semibold">Priority</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Assigned To</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-sm text-muted-foreground">
                    No tickets found.
                  </td>
                </tr>
              ) : (
                rows.map(row => (
                  <tr key={row.id} className="border-b border-border/40 align-top transition-colors hover:bg-muted/10">
                    <td className="px-4 py-4 font-medium text-foreground">{row.code}</td>
                    <td className="px-4 py-4 text-foreground">
                      <div className="max-w-[260px] truncate font-medium">{row.title}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex rounded-md border border-sky-500/20 bg-sky-500/10 px-2 py-1 text-xs font-medium text-sky-400">
                        {row.category}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-foreground">
                      <div className="font-medium">{row.clientName}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{row.clientLocation}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={cn('inline-flex rounded-md border px-2 py-1 text-xs font-medium', priorityClass(row.priority))}>
                        {row.priority}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={cn('inline-flex rounded-md border px-2 py-1 text-xs font-medium', badgeClass(row.status))}>
                        {row.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-foreground">{row.assignedTo}</td>
                    <td className="px-4 py-4 text-foreground">
                      <div>{new Date(row.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {new Date(row.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>Showing {rows.length === 0 ? 0 : 1} to {rows.length} of {totalCount} tickets</p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="icon" className="h-8 w-8 border-border bg-background" disabled>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" className="h-8 min-w-8 border-purple-500/30 bg-purple-500/10 px-3 text-purple-400 hover:bg-purple-500/20">
              1
            </Button>
            <Button type="button" variant="outline" size="icon" className="h-8 w-8 border-border bg-background" disabled>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
