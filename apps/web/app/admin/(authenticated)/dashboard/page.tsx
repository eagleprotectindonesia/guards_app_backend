import { getAllSites, getActiveSites, db } from '@repo/database';
import { redis } from '@repo/database/redis';
import { serialize } from '@/lib/server-utils';
import AdminDashboard from './dashboard-client';
import NewDashboardClient from '../new-dashboard/new-dashboard-client';
import { getDashboardTabFromSearchParams } from '@/lib/admin-tab-routing';
import { PanicAlert } from '@repo/types';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function DashboardPage(props: PageProps) {
  const searchParamsObj = await props.searchParams;

  // Re-create URLSearchParams-like searchParams
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParamsObj)) {
    if (typeof value === 'string') {
      searchParams.set(key, value);
    } else if (Array.isArray(value)) {
      value.forEach(val => searchParams.append(key, val));
    }
  }

  const tab = getDashboardTabFromSearchParams(searchParams);

  if (tab === 'guard') {
    const [activeSites, openTicketsCount, unresolvedPanicsStr] = await Promise.all([
      getActiveSites(),
      db.ticket.count({
        where: {
          status: { in: ['NEW', 'ACKNOWLEDGED', 'WAITING_INFORMATION'] },
        },
      }),
      redis.get('webhooks:unresolved_panics'),
    ]);

    let initialPanicAlerts: PanicAlert[] = [];
    if (unresolvedPanicsStr) {
      try {
        const unresolvedPanics = JSON.parse(unresolvedPanicsStr);
        if (Array.isArray(unresolvedPanics)) {
          initialPanicAlerts = unresolvedPanics.filter((p: PanicAlert) => p.status === 'unresolved');
        }
      } catch (e) {
        console.error('Failed to parse unresolved panics from redis:', e);
      }
    }

    return (
      <NewDashboardClient
        initialSites={serialize(activeSites)}
        initialOpenTickets={openTicketsCount}
        initialPanicAlerts={initialPanicAlerts}
      />
    );
  }

  // Default fallback dashboard (tab === 'dashboard' or otherwise)
  const sites = await getAllSites();
  return <AdminDashboard initialSites={serialize(sites)} />;
}
