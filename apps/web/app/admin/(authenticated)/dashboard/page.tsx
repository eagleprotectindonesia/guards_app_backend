import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import AdminDashboard from './dashboard-client';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  await requirePermission(PERMISSIONS.DASHBOARD.VIEW);

  return <AdminDashboard />;
}
