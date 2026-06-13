import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, MoreVertical } from 'lucide-react';
import { cn } from '@repo/shared';
import { badgeClass } from './ticket-dashboard-utils';
import { getCategoryStyle, getStatusLabel, priorityClass } from './ticket-overview-dashboard.utils';
import type { DashboardRow } from './ticket-overview-dashboard.types';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Props = {
  rows: DashboardRow[];
  totalCount: number;
};

function renderSlaDue(row: DashboardRow) {
  const isCompleted =
    ['SOLVED', 'CLOSED', 'CANNOT_RESOLVE', 'CANCELLED'].includes(row.status) ||
    !!row.solvedAt ||
    !!row.closedAt ||
    !!row.cannotResolveAt ||
    !!row.cancelledAt;
  if (isCompleted) {
    return (
      <span className="inline-flex rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
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

  let colorClass = 'text-emerald-600 dark:text-emerald-400 font-medium';
  if (diffMs < 0) {
    colorClass = 'text-rose-600 dark:text-rose-500 font-semibold';
  } else if (diffMs < 2 * 60 * 60 * 1000) {
    colorClass = 'text-amber-600 dark:text-amber-500 font-medium';
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

export function TicketOverviewTable({ rows, totalCount }: Props) {
  return (
    <Card className="overflow-hidden border-border/60 bg-card shadow-md flex flex-col justify-between min-h-[580px]">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50 text-left">
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
                <tr key={row.id} className="border-b border-border/25 align-middle transition-colors hover:bg-muted/30">
                  <td className="px-5 py-4 font-mono text-xs font-semibold text-muted-foreground/80">{row.code}</td>
                  <td className="px-5 py-4 text-foreground">
                    <div className="max-w-[260px] truncate font-medium text-foreground">{row.title}</div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={cn('inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold', getCategoryStyle(row.category))}>
                      {row.category}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-foreground">
                    <div className="font-semibold text-foreground">{row.clientName}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground/80">{row.clientLocation}</div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={cn('inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold', priorityClass(row.priority))}>
                      {row.priority.charAt(0) + row.priority.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={cn('inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold', badgeClass(row.status))}>
                      {getStatusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-medium text-foreground/80">{row.assignedTo}</td>
                  <td className="px-5 py-4 text-foreground">
                    <div className="font-medium text-foreground">
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground/80 hover:text-foreground hover:bg-accent"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-card border-border text-foreground">
                        <DropdownMenuItem asChild className="hover:bg-purple-500/10 hover:text-foreground focus:bg-purple-500/10 focus:text-foreground cursor-pointer">
                          <Link href={`/admin/ticket/all?ticket=${row.id}`}>
                            Open
                          </Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 border-border bg-background" disabled>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-8 min-w-8 border-purple-500/30 bg-purple-500/10 px-3 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20"
          >
            1
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 border-border bg-background" disabled>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
