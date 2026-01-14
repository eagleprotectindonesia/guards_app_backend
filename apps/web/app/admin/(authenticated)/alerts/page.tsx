import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import AdminAlertsPage from './alerts-client';

export const dynamic = 'force-dynamic';

export default async function AlertsPage() {
  await requirePermission(PERMISSIONS.ALERTS.VIEW);

  return <AdminAlertsPage />;
}
