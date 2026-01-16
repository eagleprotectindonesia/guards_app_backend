import { serialize } from '@/lib/utils';
import OfficeForm from '../../components/office-form';
import { notFound } from 'next/navigation';
import { getOfficeById } from '@/lib/data-access/offices';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function EditOfficePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(PERMISSIONS.OFFICES.EDIT);
  const { id } = await params;

  const office = await getOfficeById(id);

  if (!office) {
    notFound();
  }

  const serializedOffice = serialize(office);

  return (
    <div className="max-w-6xl mx-auto py-8">
      <OfficeForm office={serializedOffice} />
    </div>
  );
}
