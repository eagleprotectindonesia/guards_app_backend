import { getAdminById } from '@/lib/data-access/admins';
import AdminForm from '../../components/admin-form';
import { serialize } from '@/lib/utils';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

type EditAdminPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditAdminPage(props: EditAdminPageProps) {
  const params = await props.params;
  const admin = await getAdminById(params.id);

  if (!admin) {
    notFound();
  }

  const serializedAdmin = serialize(admin);

  return (
    <div className="max-w-6xl mx-auto py-8">
      <AdminForm admin={serializedAdmin} />
    </div>
  );
}
