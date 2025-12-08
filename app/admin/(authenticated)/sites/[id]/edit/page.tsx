import { prisma } from '@/lib/prisma';
import { serialize } from '@/lib/utils';
import SiteForm from '../../components/site-form';
import { notFound } from 'next/navigation';

export default async function EditSitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const site = await prisma.site.findUnique({
    where: { id },
  });

  if (!site) {
    notFound();
  }

  const serializedSite = serialize(site);

  return (
    <div className="max-w-4xl mx-auto py-8">
      <SiteForm site={serializedSite} />
    </div>
  );
}
