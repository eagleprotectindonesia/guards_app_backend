import GuardForm from '../components/guard-form';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function CreateGuardPage() {
  await requirePermission(PERMISSIONS.GUARDS.CREATE);

  return (
    <div className="max-w-6xl mx-auto py-8">
      <GuardForm />
    </div>
  );
}
