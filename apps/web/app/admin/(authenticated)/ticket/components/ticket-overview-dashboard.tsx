'use client';

import type { ComponentType } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, ChevronLeft, ChevronRight, SlidersHorizontal, MoreVertical, Ticket, ShieldCheck, CircleDashed, CheckCircle2 } from 'lucide-react';
import { cn } from '@repo/shared';
import { badgeClass } from './ticket-dashboard-utils';

const METRIC_ICONS = {
  ticket: Ticket,
  shield: ShieldCheck,
  progress: CircleDashed,
  resolved: CheckCircle2,
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
};

export type { OverviewMetric };

function priorityClass(priority: DashboardRow['priority']) {
  if (priority === 'HIGH') return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
  if (priority === 'MEDIUM') return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
}

export function TicketOverviewDashboard({ metrics, rows, totalCount }: Props) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">All Tickets</h1>
        <p className="text-sm text-muted-foreground">View and manage all tickets from one place.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
                readOnly
                value=""
                placeholder="Search tickets by ID, subject, or client..."
                className="h-11 w-full rounded-lg border border-border bg-background pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
            {['Category', 'Status', 'Priority', 'Assigned To'].map(label => (
              <div key={label} className="flex h-11 items-center justify-between rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground">
                <span>{label}</span>
                <ChevronRight className="h-4 w-4 rotate-90" />
              </div>
            ))}
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
