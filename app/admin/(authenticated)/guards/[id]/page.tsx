import { serialize } from '@/lib/utils';
import GuardDetail from '../components/guard-detail';
import { notFound } from 'next/navigation';
import { getGuardById } from '@/lib/data-access/guards';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function GuardDetailPage({ params }: Props) {
  const { id } = await params;

  const guard = await getGuardById(id);

  if (!guard) {
    notFound();
  }

  const serializedGuard = serialize(guard);

  return <GuardDetail guard={serializedGuard} />;
}
