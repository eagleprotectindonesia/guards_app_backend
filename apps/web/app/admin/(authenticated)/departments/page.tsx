import { serialize } from '@/lib/utils';
import DepartmentList from './components/department-list';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getAllDepartments } from '@/lib/data-access/departments';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const metadata: Metadata = {
  title: 'Departments Management',
};

export const dynamic = 'force-dynamic';

export default async function DepartmentsPage() {
  await requirePermission(PERMISSIONS.DEPARTMENTS.VIEW);
  
  const departments = await getAllDepartments();
  const serializedDepartments = serialize(departments);

  return (
    <div className="max-w-7xl mx-auto">
      <Suspense fallback={<div>Loading departments...</div>}>
        <DepartmentList departments={serializedDepartments} />
      </Suspense>
    </div>
  );
}
