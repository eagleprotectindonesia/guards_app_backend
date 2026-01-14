import SiteForm from '../components/site-form';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function CreateSitePage() {
  await requirePermission(PERMISSIONS.SITES.CREATE);

  return (
    <div className="max-w-6xl mx-auto py-8">
      <SiteForm />
    </div>
  );
}
