import OfficeForm from '../components/office-form';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function CreateOfficePage() {
  await requirePermission(PERMISSIONS.OFFICES.CREATE);

  return (
    <div className="max-w-6xl mx-auto py-8">
      <OfficeForm />
    </div>
  );
}
