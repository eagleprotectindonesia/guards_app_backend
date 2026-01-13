import { getAdminById } from '@/lib/data-access/admins';
import { getAllRoles } from '@/lib/data-access/roles';
import AdminForm from '../../components/admin-form';
import { serialize } from '@/lib/utils';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

type EditAdminPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditAdminPage(props: EditAdminPageProps) {
  const params = await props.params;
  const [admin, roles] = await Promise.all([getAdminById(params.id), getAllRoles()]);

  if (!admin) {
    notFound();
  }

  const serializedAdmin = serialize(admin);
  const serializedRoles = serialize(roles);

  return (
    <div className="max-w-6xl mx-auto py-8">
      <AdminForm admin={serializedAdmin} roles={serializedRoles} />
    </div>
  );
}
