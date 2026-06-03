import { getActiveSites, db } from '@repo/database';
import { serialize } from '@/lib/server-utils';
import NewDashboardClient from './new-dashboard-client';

export const dynamic = 'force-dynamic';

export default async function NewDashboardPage() {
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
