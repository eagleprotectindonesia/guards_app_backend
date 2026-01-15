import { serialize } from '@/lib/utils';
import DesignationList from './components/designation-list';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getAllDesignations } from '@/lib/data-access/designations';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const metadata: Metadata = {
  title: 'Designations Management',
};

export const dynamic = 'force-dynamic';

export default async function DesignationsPage() {
  await requirePermission(PERMISSIONS.DESIGNATIONS.VIEW);
  
  const designations = await getAllDesignations();
  const serializedDesignations = serialize(designations);

  return (
    <div className="max-w-7xl mx-auto">
      <Suspense fallback={<div>Loading designations...</div>}>
        <DesignationList designations={serializedDesignations} />
      </Suspense>
    </div>
  );
}
