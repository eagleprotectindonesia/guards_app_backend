import { getAllSites } from '@repo/database';
import { serialize } from '@/lib/server-utils';
import AdminDashboard from './dashboard-client';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const sites = await getAllSites();
  return <AdminDashboard initialSites={serialize(sites)} />;
}
