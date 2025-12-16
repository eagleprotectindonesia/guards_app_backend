import { prisma } from '@/lib/prisma';
import { serialize } from '@/lib/utils';
import GuardDetail from '../components/guard-detail';
import { notFound } from 'next/navigation';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function GuardDetailPage({ params }: Props) {
  const { id } = await params;

  const guard = await prisma.guard.findUnique({
    where: { id },
  });

  if (!guard) {
    notFound();
  }

  const serializedGuard = serialize(guard);

  return <GuardDetail guard={serializedGuard} />;
}
