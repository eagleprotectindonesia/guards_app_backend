import EmployeeForm from '../components/employee-form';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function CreateEmployeePage() {
  await requirePermission(PERMISSIONS.EMPLOYEES.CREATE);

  return (
    <div className="max-w-6xl mx-auto py-8">
      <EmployeeForm />
    </div>
  );
}