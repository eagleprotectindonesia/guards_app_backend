'use client';

import Link from 'next/link';
import { useMemo, type ComponentType, type CSSProperties } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  SlidersHorizontal,
  MoreVertical,
  Ticket,
  ShieldCheck,
  CircleDashed,
  CheckCircle2,
  TriangleAlert,
  Plus,
  FileStack,
  Inbox,
  Clock3,
  CircleCheckBig,
} from 'lucide-react';
import { cn } from '@repo/shared';
import { badgeClass } from './ticket-dashboard-utils';

const METRIC_ICONS = {
  ticket: Ticket,
  shield: ShieldCheck,
  progress: CircleDashed,
  resolved: CheckCircle2,
  breach: TriangleAlert,
} as const;

const CATEGORY_COLORS = ['#3b82f6', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#10b981'];

type OverviewMetric = {
  label: string;
  value: number;
  hint: string;
  hintTone?: 'neutral' | 'positive' | 'warning' | 'critical';
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
  resolutionTargetHours?: number;
  solvedAt?: string | null;
  closedAt?: string | null;
  cannotResolveAt?: string | null;
};

type TicketOverviewSidebar = {
  shortcuts: {
    myOpenSubmitted: number;
    unassigned: number;
    slaBreached: number;
    resolvedToday: number;
  };
  categories: Array<{
    value: string;
    label: string;
    count: number;
    percentage: number;
  }>;
  slaStatus: {
    met: number;
    pending: number;
    breached: number;
    total: number;
    metPercentage: number;
    pendingPercentage: number;
    breachedPercentage: number;
  };
};

type Props = {
  metrics: OverviewMetric[];
  sidebar: TicketOverviewSidebar;
  rows: DashboardRow[];
  totalCount: number;
  filters: {
    q: string;
    department: string;
    status: string;
    priority: string;
    assignee: string;
  };
  options: {
    departments: Array<{ value: string; label: string }>;
    assignees: Array<{ value: string; label: string }>;
  };
};

export type { OverviewMetric, TicketOverviewSidebar };

function priorityClass(priority: DashboardRow['priority']) {
  if (priority === 'HIGH') return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
  if (priority === 'MEDIUM') return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
}

const STATUS_OPTIONS = [
  'NEW',
  'ACKNOWLEDGED',
  'WAITING_INFORMATION',
  'IN_PROGRESS',
  'SOLVED',
  'CLOSED',
  'CANNOT_RESOLVE',
] as const;
const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH'] as const;

function toStatusLabel(value: string) {
  return value.replaceAll('_', ' ');
}

function getStatusLabel(status: string) {
  if (status === 'NEW' || status === 'ACKNOWLEDGED') return 'Open';
  if (status === 'IN_PROGRESS') return 'In Progress';
  if (status === 'WAITING_INFORMATION') return 'Waiting Info';
  if (status === 'SOLVED') return 'Resolved';
  if (status === 'CLOSED') return 'Closed';
  if (status === 'CANNOT_RESOLVE') return 'Unresolved';
  return status.replaceAll('_', ' ');
}

function getCategoryStyle(category: string) {
  const normalized = category.toLowerCase();
  if (normalized.includes('it') || normalized.includes('tech') || normalized.includes('support')) {
    return 'border-sky-500/20 bg-sky-500/10 text-sky-400';
  }
  if (normalized.includes('medical') || normalized.includes('health') || normalized.includes('safety')) {
    return 'border-violet-500/20 bg-violet-500/10 text-violet-400';
  }
  if (normalized.includes('site') || normalized.includes('property') || normalized.includes('access')) {
    return 'border-amber-500/20 bg-amber-500/10 text-amber-400';
  }
  if (normalized.includes('equipment') || normalized.includes('device') || normalized.includes('damage')) {
    return 'border-orange-500/20 bg-orange-500/10 text-orange-400';
  }
  if (normalized.includes('hr') || normalized.includes('staff') || normalized.includes('request')) {
    return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400';
  }
  if (normalized.includes('incident') || normalized.includes('report') || normalized.includes('emergency')) {
    return 'border-rose-500/20 bg-rose-500/10 text-rose-400';
  }
  return 'border-zinc-500/20 bg-zinc-500/10 text-zinc-400';
}

function renderSlaDue(row: DashboardRow) {
  const isCompleted = ['SOLVED', 'CLOSED', 'CANNOT_RESOLVE'].includes(row.status) || !!row.solvedAt || !!row.closedAt || !!row.cannotResolveAt;
  if (isCompleted) {
    return (
      <span className="inline-flex rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-400">
        Completed
      </span>
    );
  }

  if (!row.resolutionTargetHours) {
    return <span className="text-muted-foreground">-</span>;
  }

  const created = new Date(row.createdAt);
  const dueTime = new Date(created.getTime() + row.resolutionTargetHours * 60 * 60 * 1000);
  const now = new Date();
  const diffMs = dueTime.getTime() - now.getTime();

  let colorClass = 'text-emerald-400 font-medium';
  if (diffMs < 0) {
    colorClass = 'text-rose-500 font-semibold';
  } else if (diffMs < 2 * 60 * 60 * 1000) { // < 2 hours
    colorClass = 'text-amber-500 font-medium';
  }

  return (
    <div>
      <div className={colorClass}>
        {dueTime.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {dueTime.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })}
      </div>
    </div>
  );
}

function buildConicGradient(segments: Array<{ value: number; color: string }>) {
  const total = segments.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) {
    return 'conic-gradient(#1f2937 0% 100%)';
  }

  let current = 0;
  const parts = segments.map(segment => {
    const start = current;
    current += (segment.value / total) * 100;
    return `${segment.color} ${start}% ${current}%`;
  });

  return `conic-gradient(${parts.join(', ')})`;
}

function DonutChart({ total, label, background }: { total: number; label: string; background: string }) {
  return (
    <div className="flex justify-center">
      <div className="relative flex h-32 w-32 items-center justify-center rounded-full" style={{ background }}>
        <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-card text-center">
          <p className="text-2xl font-bold tracking-tight text-foreground">{total}</p>
          <p className="text-[10px] text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}

function SidebarSectionTitle({ children }: { children: string }) {
  return <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{children}</h2>;
}

export function TicketOverviewDashboard({ metrics, sidebar, rows, totalCount, filters, options }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const paramsBase = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);
  const categoryDonutStyle = useMemo<CSSProperties>(
    () => ({
      background: buildConicGradient(
        sidebar.categories.map((item, index) => ({
          value: item.count,
          color: CATEGORY_COLORS[index % CATEGORY_COLORS.length]!,
        }))
      ),
    }),
    [sidebar.categories]
  );
  const slaDonutStyle = useMemo<CSSProperties>(
    () => ({
      background: buildConicGradient([
        { value: sidebar.slaStatus.met, color: '#22c55e' },
        { value: sidebar.slaStatus.pending, color: '#f59e0b' },
        { value: sidebar.slaStatus.breached, color: '#ef4444' },
      ]),
    }),
    [sidebar.slaStatus.breached, sidebar.slaStatus.met, sidebar.slaStatus.pending]
  );

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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-5">
            {metrics.map(metric => {
              const Icon: ComponentType<{ className?: string }> = METRIC_ICONS[metric.icon];

              let valueColorClass = 'text-foreground';
              let hintColorClass = 'text-muted-foreground';

              if (metric.icon === 'ticket') {
                valueColorClass = 'text-sky-400';
              } else if (metric.icon === 'shield') {
                valueColorClass = 'text-amber-500';
              } else if (metric.icon === 'progress') {
                valueColorClass = 'text-emerald-500';
              } else if (metric.icon === 'resolved') {
                valueColorClass = 'text-violet-400';
              } else if (metric.icon === 'breach') {
                valueColorClass = 'text-rose-500';
              }

              if (metric.hintTone === 'positive') {
                hintColorClass = 'text-emerald-400 font-medium';
              } else if (metric.hintTone === 'warning') {
                hintColorClass = 'text-amber-400 font-medium';
              } else if (metric.hintTone === 'critical') {
                hintColorClass = 'text-rose-400 font-medium';
              }

              return (
                <Card key={metric.label} className="border-[#1f2432] bg-[#11141d] p-5 shadow-md hover:border-[#2f374c] transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={cn('rounded-xl border p-3 shrink-0', metric.accentClass)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-1 min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
                        {metric.label}
                      </p>
                      <p className={cn('text-3xl font-extrabold tracking-tight', valueColorClass)}>{metric.value}</p>
                      <p className={cn('text-xs', hintColorClass)}>{metric.hint}</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between w-full">
            <div className="relative flex-1 min-w-[260px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
              <input
                defaultValue={filters.q}
                onBlur={event => applySearch(event.currentTarget.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') applySearch(event.currentTarget.value);
                }}
                placeholder="Search tickets by ID, subject, or client..."
                className="h-10 w-full rounded-lg border border-border/80 bg-zinc-950/40 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-border transition-colors"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center sm:gap-3 shrink-0">
              <div className="flex flex-col gap-1.5 min-w-[130px]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Category</span>
                <div className="relative">
                  <select
                    value={filters.department}
                    onChange={event => setParam('department', event.target.value)}
                    className="h-10 w-full appearance-none rounded-lg border border-border/80 bg-zinc-950/40 px-3 pr-9 text-sm text-foreground focus:outline-none focus:border-border transition-colors"
                  >
                    <option value="">All Categories</option>
                    {options.departments.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5 min-w-[130px]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Status</span>
                <div className="relative">
                  <select
                    value={filters.status}
                    onChange={event => setParam('status', event.target.value)}
                    className="h-10 w-full appearance-none rounded-lg border border-border/80 bg-zinc-950/40 px-3 pr-9 text-sm text-foreground focus:outline-none focus:border-border transition-colors"
                  >
                    <option value="">All Status</option>
                    {STATUS_OPTIONS.map(option => (
                      <option key={option} value={option}>
                        {toStatusLabel(option)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5 min-w-[130px]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Priority</span>
                <div className="relative">
                  <select
                    value={filters.priority}
                    onChange={event => setParam('priority', event.target.value)}
                    className="h-10 w-full appearance-none rounded-lg border border-border/80 bg-zinc-950/40 px-3 pr-9 text-sm text-foreground focus:outline-none focus:border-border transition-colors"
                  >
                    <option value="">All Priorities</option>
                    {PRIORITY_OPTIONS.map(option => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5 min-w-[130px]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Assigned To</span>
                <div className="relative">
                  <select
                    value={filters.assignee}
                    onChange={event => setParam('assignee', event.target.value)}
                    className="h-10 w-full appearance-none rounded-lg border border-border/80 bg-zinc-950/40 px-3 pr-9 text-sm text-foreground focus:outline-none focus:border-border transition-colors"
                  >
                    <option value="">All Users</option>
                    {options.assignees.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wider text-transparent select-none">Filters</span>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 gap-2 border-border/80 bg-zinc-950/40 px-4 text-sm font-medium text-foreground hover:bg-zinc-800/50 hover:text-foreground transition-colors"
                >
                  <SlidersHorizontal className="h-4 w-4 text-muted-foreground/80" />
                  Filters
                </Button>
              </div>
            </div>
          </div>

          <Card className="overflow-hidden border-[#1f2432] bg-[#11141d] shadow-md flex flex-col justify-between min-h-[580px]">

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-950/40 text-left">
                  <tr className="border-b border-border/40 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
                    <th className="px-5 py-4 font-bold">Ticket ID</th>
                    <th className="px-5 py-4 font-bold">Subject</th>
                    <th className="px-5 py-4 font-bold">Category</th>
                    <th className="px-5 py-4 font-bold">Site / Client</th>
                    <th className="px-5 py-4 font-bold">Priority</th>
                    <th className="px-5 py-4 font-bold">Status</th>
                    <th className="px-5 py-4 font-bold">Assigned To</th>
                    <th className="px-5 py-4 font-bold">Created</th>
                    <th className="px-5 py-4 font-bold">SLA Due</th>
                    <th className="px-5 py-4 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-5 py-20 text-center text-sm text-muted-foreground/60">
                        No tickets found.
                      </td>
                    </tr>
                  ) : (
                    rows.map(row => (
                      <tr
                        key={row.id}
                        className="border-b border-border/25 align-middle transition-colors hover:bg-zinc-900/20"
                      >
                        <td className="px-5 py-4 font-mono text-xs font-semibold text-muted-foreground/80">{row.code}</td>
                        <td className="px-5 py-4 text-foreground">
                          <div className="max-w-[260px] truncate font-medium text-zinc-100">{row.title}</div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={cn("inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold", getCategoryStyle(row.category))}>
                            {row.category}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-foreground">
                          <div className="font-semibold text-zinc-100">{row.clientName}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground/80">{row.clientLocation}</div>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={cn(
                              'inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold',
                              priorityClass(row.priority)
                            )}
                          >
                            {row.priority.charAt(0) + row.priority.slice(1).toLowerCase()}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={cn(
                              'inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold',
                              badgeClass(row.status)
                            )}
                          >
                            {getStatusLabel(row.status)}
                          </span>
                        </td>
                        <td className="px-5 py-4 font-medium text-zinc-300">{row.assignedTo}</td>
                        <td className="px-5 py-4 text-foreground">
                          <div className="font-medium text-zinc-200">
                            {new Date(row.createdAt).toLocaleTimeString('en-GB', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground/75">
                            {new Date(row.createdAt).toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </div>
                        </td>
                        <td className="px-5 py-4">{renderSlaDue(row)}</td>
                        <td className="px-5 py-4 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground/80 hover:text-foreground hover:bg-zinc-800/40"
                          >
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
              <p>
                Showing {rows.length === 0 ? 0 : 1} to {rows.length} of {totalCount} tickets
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 border-border bg-background"
                  disabled
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 min-w-8 border-purple-500/30 bg-purple-500/10 px-3 text-purple-400 hover:bg-purple-500/20"
                >
                  1
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 border-border bg-background"
                  disabled
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="border-[#1f2432] bg-[#11141d] p-4 shadow-md">
            <SidebarSectionTitle>Ticket Shortcuts</SidebarSectionTitle>
            <div className="mt-3 space-y-1.5">
              <Link
                href="/admin/ticket/create"
                className="flex items-center justify-between rounded-xl border border-border/40 bg-background/50 px-3 py-2 text-sm transition-colors hover:bg-zinc-800/40"
              >
                <span className="flex items-center gap-3 font-medium text-foreground">
                  <span className="rounded-lg border border-border/40 bg-zinc-900/60 p-1 text-muted-foreground">
                    <Plus className="h-4 w-4" />
                  </span>
                  Create New Ticket
                </span>
              </Link>

              {[
                {
                  label: 'My Open Tickets',
                  value: sidebar.shortcuts.myOpenSubmitted,
                  icon: FileStack,
                },
                {
                  label: 'Unassigned Tickets',
                  value: sidebar.shortcuts.unassigned,
                  icon: Inbox,
                },
                {
                  label: 'SLA Breached',
                  value: sidebar.shortcuts.slaBreached,
                  icon: Clock3,
                },
                {
                  label: "Today's Resolved",
                  value: sidebar.shortcuts.resolvedToday,
                  icon: CircleCheckBig,
                },
              ].map(item => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-xl border border-border/40 bg-background/30 px-3 py-2"
                  >
                    <span className="flex items-center gap-3 text-sm text-foreground">
                      <span className="rounded-lg border border-border/40 bg-zinc-900/60 p-1 text-muted-foreground">
                        <Icon className="h-4 w-4" />
                      </span>
                      {item.label}
                    </span>
                    <span className="inline-flex min-w-8 justify-center rounded-full bg-rose-500 px-2 py-0.5 text-xs font-semibold text-white">
                      {item.value}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="border-[#1f2432] bg-[#11141d] p-4 shadow-md">
            <SidebarSectionTitle>Tickets By Category</SidebarSectionTitle>
            <div className="mt-3 space-y-3">
              <DonutChart
                total={sidebar.slaStatus.total}
                label="Total"
                background={categoryDonutStyle.background as string}
              />
              <div className="space-y-2">
                {sidebar.categories.map((item, index) => (
                  <div key={item.value} className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }}
                      />
                      <span className="truncate text-muted-foreground">{item.label}</span>
                    </div>
                    <span className="shrink-0 font-medium text-foreground">
                      {item.count} ({item.percentage}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="border-[#1f2432] bg-[#11141d] p-4 shadow-md">
            <SidebarSectionTitle>SLA Status</SidebarSectionTitle>
            <div className="mt-3 space-y-3">
              <DonutChart
                total={sidebar.slaStatus.metPercentage}
                label="Met %"
                background={slaDonutStyle.background as string}
              />
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                    <span className="text-muted-foreground">Met</span>
                  </div>
                  <span className="font-medium text-foreground">{sidebar.slaStatus.met}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                    <span className="text-muted-foreground">Pending</span>
                  </div>
                  <span className="font-medium text-foreground">{sidebar.slaStatus.pending}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                    <span className="text-muted-foreground">Breached</span>
                  </div>
                  <span className="font-medium text-foreground">{sidebar.slaStatus.breached}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
