import DesignationForm from '../../components/designation-form';
import type { Metadata } from 'next';
import { getDesignationById } from '@/lib/data-access/designations';
import { getAllDepartments } from '@/lib/data-access/departments';
import { notFound } from 'next/navigation';
import { serialize } from '@/lib/utils';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const metadata: Metadata = {
  title: 'Edit Designation',
};

type EditDesignationPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditDesignationPage({ params }: EditDesignationPageProps) {
  await requirePermission(PERMISSIONS.DESIGNATIONS.EDIT);
  const { id } = await params;
  
  const [designation, departments] = await Promise.all([
    getDesignationById(id),
    getAllDepartments(),
  ]);

  if (!designation) {
    notFound();
  }

  return (
    <div className="max-w-7xl mx-auto py-6">
      <DesignationForm 
        designation={serialize(designation)} 
        departments={serialize(departments)} 
      />
    </div>
  );
}
