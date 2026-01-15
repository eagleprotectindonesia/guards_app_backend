import DesignationForm from '../components/designation-form';
import type { Metadata } from 'next';
import { getAllDepartments } from '@/lib/data-access/departments';
import { serialize } from '@/lib/utils';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const metadata: Metadata = {
  title: 'Create Designation',
};

export default async function CreateDesignationPage() {
  await requirePermission(PERMISSIONS.DESIGNATIONS.CREATE);
  
  const departments = await getAllDepartments();

  return (
    <div className="max-w-7xl mx-auto py-6">
      <DesignationForm departments={serialize(departments)} />
    </div>
  );
}
