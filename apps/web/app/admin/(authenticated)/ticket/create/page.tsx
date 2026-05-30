import { getAdminSession, requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { TicketCreateForm } from '../components/ticket-create-form';

export const dynamic = 'force-dynamic';

export default async function CreateTicketPage() {
  await requirePermission(PERMISSIONS.TICKETS.CREATE);
  const admin = await getAdminSession();
  return <TicketCreateForm adminName={admin?.name ?? 'Admin'} />;
}
