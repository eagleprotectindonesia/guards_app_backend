'use client';

import { useRouter } from 'next/navigation';
import { useSocketEvent } from '@/hooks/use-socket-event';

export type { OverviewMetric, TicketOverviewSidebar } from './ticket-overview-dashboard.types';

export function TicketOverviewDashboard({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // Listen to real-time ticket events to refresh server-fetched metrics/data
  useSocketEvent('ticket_created', () => {
    router.refresh();
  });

  useSocketEvent('ticket_status_updated', () => {
    router.refresh();
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">All Tickets</h1>
        <p className="text-sm text-muted-foreground">View and manage all tickets from one place.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        {children}
      </div>
    </div>
  );
}
