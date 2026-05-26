import { redirect } from 'next/navigation';
import { getAllSites } from '@repo/database';
import { serialize } from '@/lib/server-utils';
import AdminDashboard from '../../dashboard/dashboard-client';
import { isAdminTabSlug } from '@/lib/admin-tab-routing';

export const dynamic = 'force-dynamic';

export default async function TabDashboardPage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;

  if (!isAdminTabSlug(tab)) {
    redirect('/admin/live/dashboard');
  }

  const sites = await getAllSites();
  return <AdminDashboard initialSites={serialize(sites)} />;
}
