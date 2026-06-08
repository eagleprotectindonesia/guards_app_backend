'use client';

import { useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSocketEvent } from '@/hooks/use-socket-event';
import type { TicketOverviewDashboardProps } from './ticket-overview-dashboard.types';
import { TicketOverviewMetrics } from './ticket-overview-dashboard-metrics';
import { TicketOverviewFilters } from './ticket-overview-dashboard-filters';
import { TicketOverviewTable } from './ticket-overview-dashboard-table';
import { TicketOverviewSidebarPanel } from './ticket-overview-dashboard-sidebar';

export type { OverviewMetric, TicketOverviewSidebar } from './ticket-overview-dashboard.types';

export function TicketOverviewDashboard({ metrics, sidebar, rows, totalCount, filters, options }: TicketOverviewDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Listen to real-time ticket events to refresh server-fetched metrics/data
  useSocketEvent('ticket_created', () => {
    router.refresh();
  });

  useSocketEvent('ticket_status_updated', () => {
    router.refresh();
  });

  useSocketEvent('ticket_message_added', () => {
    router.refresh();
  });

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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <TicketOverviewMetrics metrics={metrics} />

          <TicketOverviewFilters
            filters={filters}
            options={options}
            onSearch={applySearch}
            onFilterChange={(key, value) => setParam(key, value)}
          />

          <TicketOverviewTable rows={rows} totalCount={totalCount} />
        </div>

        <div className="space-y-4">
          <TicketOverviewSidebarPanel sidebar={sidebar} />
        </div>
      </div>
    </div>
  );
}
