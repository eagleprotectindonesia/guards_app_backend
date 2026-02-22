import { getAllSites } from '@/lib/data-access/sites';
import { serialize } from '@/lib/utils';
import AdminDashboard from './dashboard-client';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const sites = await getAllSites();
  return <AdminDashboard initialSites={serialize(sites)} />;
}
