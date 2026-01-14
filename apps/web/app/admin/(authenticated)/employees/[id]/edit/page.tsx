import { serialize } from '@/lib/utils';
import EmployeeForm from '../../components/employee-form';
import { notFound } from 'next/navigation';
import { getEmployeeById } from '@/lib/data-access/employees';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(PERMISSIONS.EMPLOYEES.EDIT);
  const { id } = await params;

  const employee = await getEmployeeById(id);

  if (!employee) {
    notFound();
  }

  const serializedEmployee = serialize(employee);

  return (
    <div className="max-w-6xl mx-auto py-8">
      <EmployeeForm employee={serializedEmployee} />
    </div>
  );
}