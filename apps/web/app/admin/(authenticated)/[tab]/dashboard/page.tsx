import { redirect } from 'next/navigation';
import { getAllSites } from '@repo/database';
import { serialize } from '@/lib/server-utils';
import AdminDashboard from '../../dashboard/dashboard-client';
import { isAdminTabSlug } from '@/lib/admin-tab-routing';
import { requirePermission } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ tab: string }>;
};

export default async function TabDashboardPage({ params }: PageProps) {
  const { tab } = await params;

  if (!isAdminTabSlug(tab)) {
    redirect('/admin/dashboard');
  }

  if (tab === 'guard') {
    redirect('/admin/dashboard?dashboardTab=guard');
  }

  if (tab === 'ticket') {
    redirect('/admin/ticket/dashboard');
  }

  if (tab === 'workforce') {
    redirect('/admin/hr');
  }

  if (tab === 'client') {
    redirect('/admin/client/dashboard');
  }

  if (tab === 'dashboard') {
    await requirePermission('dashboard:view');
  } else {
    await requirePermission('dashboard-system:view');
  }

  const sites = await getAllSites();
  return <AdminDashboard initialSites={serialize(sites)} />;
}
