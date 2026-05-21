import { getActiveSites } from '@repo/database';
import { serialize } from '@/lib/server-utils';
import NewDashboardClient from './new-dashboard-client';

export const dynamic = 'force-dynamic';

export default async function NewDashboardPage() {
  const activeSites = await getActiveSites();

  return <NewDashboardClient initialSites={serialize(activeSites)} />;
}
