import { prisma } from '@/lib/prisma';
import AdminForm from '../../components/admin-form';
import { serialize } from '@/lib/utils';
import { notFound } from 'next/navigation';

type EditAdminPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditAdminPage(props: EditAdminPageProps) {
  const params = await props.params;
  const admin = await prisma.admin.findUnique({
    where: { id: params.id },
  });

  if (!admin) {
    notFound();
  }

  const serializedAdmin = serialize(admin);

  return (
    <div className="max-w-4xl mx-auto py-8">
      <AdminForm admin={serializedAdmin} />
    </div>
  );
}
