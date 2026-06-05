import { getAllSites, getActiveSites, db } from '@repo/database';
import { serialize } from '@/lib/server-utils';
import AdminDashboard from './dashboard-client';
import NewDashboardClient from '../new-dashboard/new-dashboard-client';
import { getDashboardTabFromSearchParams } from '@/lib/admin-tab-routing';

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
    const [activeSites, openTicketsCount] = await Promise.all([
      getActiveSites(),
      db.ticket.count({
        where: {
          status: { in: ['NEW', 'ACKNOWLEDGED', 'WAITING_INFORMATION'] },
        },
      }),
    ]);

    return (
      <NewDashboardClient
        initialSites={serialize(activeSites)}
        initialOpenTickets={openTicketsCount}
      />
    );
  }

  // Default fallback dashboard (tab === 'dashboard' or otherwise)
  const sites = await getAllSites();
  return <AdminDashboard initialSites={serialize(sites)} />;
}
