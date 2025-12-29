import { serialize } from '@/lib/utils';
import GuardForm from '../../components/guard-form';
import { notFound } from 'next/navigation';
import { getGuardById } from '@/lib/data-access/guards';

export default async function EditGuardPage({ params }: { params: Promise<{ id: string }> }) {
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
