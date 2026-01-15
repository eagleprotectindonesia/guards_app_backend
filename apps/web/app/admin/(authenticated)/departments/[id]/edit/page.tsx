import DepartmentForm from '../../components/department-form';
import type { Metadata } from 'next';
import { getDepartmentById } from '@/lib/data-access/departments';
import { notFound } from 'next/navigation';
import { serialize } from '@/lib/utils';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const metadata: Metadata = {
  title: 'Edit Department',
};

type EditDepartmentPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditDepartmentPage({ params }: EditDepartmentPageProps) {
  await requirePermission(PERMISSIONS.DEPARTMENTS.EDIT);
  const { id } = await params;
  const department = await getDepartmentById(id);

  if (!department) {
    notFound();
  }

  return (
    <div className="max-w-7xl mx-auto py-6">
      <DepartmentForm department={serialize(department)} />
    </div>
  );
}
