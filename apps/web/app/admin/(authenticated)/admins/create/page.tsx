import { getAllRoles } from '@/lib/data-access/roles';
import { serialize } from '@/lib/utils';
import AdminForm from '../components/admin-form';

export const dynamic = 'force-dynamic';

export default async function CreateAdminPage() {
  const roles = await getAllRoles();

  return (
    <div className="max-w-6xl mx-auto py-8">
      <AdminForm roles={serialize(roles)} />
    </div>
  );
}
