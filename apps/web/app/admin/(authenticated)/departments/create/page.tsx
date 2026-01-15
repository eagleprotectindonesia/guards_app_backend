import DepartmentForm from '../components/department-form';
import type { Metadata } from 'next';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const metadata: Metadata = {
  title: 'Create Department',
};

export default async function CreateDepartmentPage() {
  await requirePermission(PERMISSIONS.DEPARTMENTS.CREATE);

  return (
    <div className="max-w-7xl mx-auto py-6">
      <DepartmentForm />
    </div>
  );
}
