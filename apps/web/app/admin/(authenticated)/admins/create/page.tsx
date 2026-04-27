import { getActiveOffices, getAllRoles, getDistinctNormalizedDepartmentKeys } from '@repo/database';
import AdminForm from '../components/admin-form';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { SerializedAdminOwnershipOptionDto, SerializedRoleDto } from '@/types/admins';

export const dynamic = 'force-dynamic';

export default async function CreateAdminPage() {
  await requirePermission(PERMISSIONS.ADMINS.CREATE);
  const [roles, offices, departmentKeys] = await Promise.all([
    getAllRoles(),
    getActiveOffices(),
    getDistinctNormalizedDepartmentKeys(),
  ]);

  const serializedRoles: SerializedRoleDto[] = roles.map(role => ({
    id: role.id,
    name: role.name,
  }));

  const serializedDepartmentOptions: SerializedAdminOwnershipOptionDto[] = departmentKeys.map(key => ({
    id: key,
    label: key,
  }));

  const serializedOfficeOptions: SerializedAdminOwnershipOptionDto[] = offices.map(office => ({
    id: office.id,
    label: office.name,
  }));

  return (
    <div className="max-w-6xl mx-auto py-8">
      <AdminForm
        roles={serializedRoles}
        departmentOptions={serializedDepartmentOptions}
        officeOptions={serializedOfficeOptions}
        leaveOwnershipAssignments={[]}
        employeeVisibilityOwnershipAssignments={[]}
      />
    </div>
  );
}
