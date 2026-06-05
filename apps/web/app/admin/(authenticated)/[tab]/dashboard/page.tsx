import { redirect } from 'next/navigation';
import { getAllSites } from '@repo/database';
import { serialize } from '@/lib/server-utils';
import AdminDashboard from '../../dashboard/dashboard-client';
import { isAdminTabSlug } from '@/lib/admin-tab-routing';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ tab: string }>;
};

export default async function TabDashboardPage({ params }: PageProps) {
  const { tab } = await params;

  if (!isAdminTabSlug(tab)) {
    redirect('/admin/new-dashboard');
  }

  if (tab === 'live') {
    redirect('/admin/new-dashboard');
  }

  if (tab === 'ticket') {
    redirect('/admin/ticket/dashboard');
  }

  if (tab === 'workforce') {
    redirect('/admin/hr');
  }

  const sites = await getAllSites();
  return <AdminDashboard initialSites={serialize(sites)} />;
}
