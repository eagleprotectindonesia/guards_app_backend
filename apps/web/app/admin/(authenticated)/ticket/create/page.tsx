import { getAllRoles } from '@repo/database';
import { getAdminSession, requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { TicketCreateForm } from '../components/ticket-create-form';

export const dynamic = 'force-dynamic';

export default async function CreateTicketPage() {
  await requirePermission(PERMISSIONS.TICKETS.CREATE);
  const admin = await getAdminSession();
  const roles = await getAllRoles();

  return (
    <TicketCreateForm
      adminName={admin?.name ?? 'Admin'}
      roleOptions={roles.map(role => ({ id: role.id, name: role.name }))}
    />
  );
}
