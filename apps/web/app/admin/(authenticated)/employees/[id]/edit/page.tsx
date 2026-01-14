import { serialize } from '@/lib/utils';
import GuardForm from '../../components/guard-form';
import { notFound } from 'next/navigation';
import { getGuardById } from '@/lib/data-access/guards';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function EditGuardPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(PERMISSIONS.GUARDS.EDIT);
  const { id } = await params;

  const guard = await getGuardById(id);

  if (!guard) {
    notFound();
  }

  const serializedGuard = serialize(guard);

  return (
    <div className="max-w-6xl mx-auto py-8">
      <GuardForm guard={serializedGuard} />
    </div>
  );
}
