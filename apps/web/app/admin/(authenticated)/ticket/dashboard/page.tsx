import { Suspense } from 'react';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { TicketOverviewDashboard } from '../components/ticket-overview-dashboard';
import {
  DashboardMetricsContainer,
  DashboardFiltersContainer,
  DashboardTableContainer,
  DashboardSidebarContainer,
} from '../components/dashboard-containers';
import {
  MetricsSkeleton,
  FiltersSkeleton,
  TableSkeleton,
  SidebarSkeleton,
} from '../components/dashboard-skeletons';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function TicketDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requirePermission(PERMISSIONS.TICKETS.VIEW);
  const query = await searchParams;

  return (
    <TicketOverviewDashboard>
      <div className="space-y-6">
        <Suspense fallback={<MetricsSkeleton />}>
          <DashboardMetricsContainer />
        </Suspense>

        <Suspense fallback={<FiltersSkeleton />}>
          <DashboardFiltersContainer />
        </Suspense>

        <Suspense fallback={<TableSkeleton />} key={JSON.stringify(query)}>
          <DashboardTableContainer searchParams={query} />
        </Suspense>
      </div>

      <div className="space-y-4">
        <Suspense fallback={<SidebarSkeleton />}>
          <DashboardSidebarContainer adminId={session.id} />
        </Suspense>
      </div>
    </TicketOverviewDashboard>
  );
}
