import {
  getActiveOffices,
  getAdminById,
  getAdminOwnershipAssignments,
  getAllRoles,
  getDistinctNormalizedDepartmentKeys,
} from '@repo/database';
import AdminForm from '../../components/admin-form';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import {
  SerializedAdminOwnershipAssignmentDto,
  SerializedAdminOwnershipOptionDto,
  SerializedAdminWithRoleDto,
  SerializedRoleDto,
} from '@/types/admins';

export const dynamic = 'force-dynamic';

type EditAdminPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditAdminPage(props: EditAdminPageProps) {
  await requirePermission(PERMISSIONS.ADMINS.EDIT);
  const params = await props.params;
  const [admin, roles, leaveOwnershipAssignments, employeeVisibilityOwnershipAssignments, offices, departmentKeys] =
    await Promise.all([
      getAdminById(params.id),
      getAllRoles(),
      getAdminOwnershipAssignments(params.id, 'leave'),
      getAdminOwnershipAssignments(params.id, 'employees'),
      getActiveOffices(),
      getDistinctNormalizedDepartmentKeys(),
    ]);

  if (!admin) {
    notFound();
  }

  const serializedAdmin: SerializedAdminWithRoleDto = {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    twoFactorEnabled: admin.twoFactorEnabled,
    includeFallbackLeaveQueue: admin.includeFallbackLeaveQueue,
    note: admin.note,
    roleRef: admin.roleRef ? { id: admin.roleRef.id, name: admin.roleRef.name } : null,
    createdAt: admin.createdAt.toISOString(),
    updatedAt: admin.updatedAt.toISOString(),
  };

  const serializedRoles: SerializedRoleDto[] = roles.map(role => ({
    id: role.id,
    name: role.name,
  }));

  const serializedLeaveOwnershipAssignments: SerializedAdminOwnershipAssignmentDto[] = leaveOwnershipAssignments.map(
    assignment => ({
      id: assignment.id,
      domain: 'leave',
      departmentKey: assignment.departmentKey,
      officeId: assignment.officeId,
      officeName: assignment.office?.name ?? null,
      priority: assignment.priority,
      isActive: assignment.isActive,
    })
  );
  const serializedEmployeeVisibilityOwnershipAssignments: SerializedAdminOwnershipAssignmentDto[] =
    employeeVisibilityOwnershipAssignments.map(assignment => ({
      id: assignment.id,
      domain: 'employees',
      departmentKey: assignment.departmentKey,
      officeId: assignment.officeId,
      officeName: assignment.office?.name ?? null,
      priority: assignment.priority,
      isActive: assignment.isActive,
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
        admin={serializedAdmin}
        roles={serializedRoles}
        leaveOwnershipAssignments={serializedLeaveOwnershipAssignments}
        employeeVisibilityOwnershipAssignments={serializedEmployeeVisibilityOwnershipAssignments}
        departmentOptions={serializedDepartmentOptions}
        officeOptions={serializedOfficeOptions}
      />
    </div>
  );
}
