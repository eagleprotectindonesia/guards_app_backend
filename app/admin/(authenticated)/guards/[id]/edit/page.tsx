import { prisma } from '@/lib/prisma';
import { serialize } from '@/lib/utils';
import GuardForm from '../../components/guard-form';
import { notFound } from 'next/navigation';

export default async function EditGuardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  const guard = await prisma.guard.findUnique({
    where: { id },
  });

  if (!guard) {
    notFound();
  }

  const serializedGuard = serialize(guard);

  return (
    <div className="max-w-4xl mx-auto py-8">
      <GuardForm guard={serializedGuard} />
    </div>
  );
}
